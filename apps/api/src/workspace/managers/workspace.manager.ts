/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cron, CronExpression } from '@nestjs/schedule'
import { In, Not, Raw, Repository } from 'typeorm'
import { Workspace } from '../entities/workspace.entity'
import { WorkspaceState } from '../enums/workspace-state.enum'
import { WorkspaceDesiredState } from '../enums/workspace-desired-state.enum'
import { NodeApiFactory } from '../runner-api/runnerApi'
import { NodeService } from '../services/node.service'
import { EnumsSandboxState as NodeWorkspaceState } from '@daytonaio/runner-api-client'
import { NodeState } from '../enums/node-state.enum'
import { DockerRegistryService } from '../../docker-registry/services/docker-registry.service'
import { SnapshotState } from '../enums/snapshot-state.enum'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { ImageService } from '../services/image.service'
import { RedisLockProvider } from '../common/redis-lock.provider'
import { WORKSPACE_WARM_POOL_UNASSIGNED_ORGANIZATION } from '../constants/workspace.constants'
import { DockerProvider } from '../docker/docker-provider'
import { ImageNodeState } from '../enums/image-node-state.enum'
import { BuildInfo } from '../entities/build-info.entity'
import { CreateSandboxDTO } from '@daytonaio/runner-api-client'
import { fromAxiosError } from '../../common/utils/from-axios-error'
import { OnEvent } from '@nestjs/event-emitter'
import { WorkspaceEvents } from '../constants/workspace-events.constants'
import { WorkspaceStoppedEvent } from '../events/workspace-stopped.event'
import { WorkspaceStartedEvent } from '../events/workspace-started.event'
import { WorkspaceArchivedEvent } from '../events/workspace-archived.event'
import { WorkspaceDestroyedEvent } from '../events/workspace-destroyed.event'
import { WorkspaceCreatedEvent } from '../events/workspace-create.event'
import { ImageNode } from '../entities/image-node.entity'

const SYNC_INSTANCE_STATE_LOCK_KEY = 'sync-instance-state-'
const SYNC_AGAIN = true
const DONT_SYNC_AGAIN = false
type ShouldSyncAgain = boolean
type StateSyncHandler = (workspace: Workspace) => Promise<ShouldSyncAgain>

@Injectable()
export class WorkspaceManager {
  private readonly logger = new Logger(WorkspaceManager.name)

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(ImageNode)
    private readonly imageNodeRepository: Repository<ImageNode>,
    private readonly nodeService: NodeService,
    private readonly nodeApiFactory: NodeApiFactory,
    private readonly dockerRegistryService: DockerRegistryService,
    @InjectRedis() private readonly redis: Redis,
    private readonly imageService: ImageService,
    private readonly redisLockProvider: RedisLockProvider,
    private readonly dockerProvider: DockerProvider,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'auto-stop-check' })
  async autostopCheck(): Promise<void> {
    //  lock the sync to only run one instance at a time
    const snapshotCheckWorkerSelected = await this.redis.get('auto-stop-check-worker-selected')
    if (snapshotCheckWorkerSelected) {
      return
    }
    //  keep the worker selected for 1 minute
    await this.redis.setex('auto-stop-check-worker-selected', 60, '1')

    // Get all ready nodes
    const allNodes = await this.nodeService.findAll()
    const readyNodes = allNodes.filter((node) => node.state === NodeState.READY)

    // Process all nodes in parallel
    await Promise.all(
      readyNodes.map(async (node) => {
        const workspaces = await this.workspaceRepository.find({
          where: {
            nodeId: node.id,
            organizationId: Not(WORKSPACE_WARM_POOL_UNASSIGNED_ORGANIZATION),
            state: WorkspaceState.STARTED,
            autoStopInterval: Not(0),
            lastActivityAt: Raw((alias) => `${alias} < NOW() - INTERVAL '1 minute' * "autoStopInterval"`),
          },
          order: {
            lastSnapshotAt: 'ASC',
          },
          //  todo: increase this number when auto-stop is stable
          take: 10,
        })

        await Promise.all(
          workspaces.map(async (workspace) => {
            const lockKey = SYNC_INSTANCE_STATE_LOCK_KEY + workspace.id
            const acquired = await this.redisLockProvider.lock(lockKey, 30)
            if (!acquired) {
              return
            }

            try {
              workspace.desiredState = WorkspaceDesiredState.STOPPED
              await this.workspaceRepository.save(workspace)
              await this.redisLockProvider.unlock(lockKey)
              this.syncInstanceState(workspace.id)
            } catch (error) {
              this.logger.error(
                `Error processing auto-stop state for workspace ${workspace.id}:`,
                fromAxiosError(error),
              )
            }
          }),
        )
      }),
    )
  }

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'sync-states' })
  async syncStates(): Promise<void> {
    const lockKey = 'sync-states'
    if (!(await this.redisLockProvider.lock(lockKey, 30))) {
      return
    }

    const workspaces = await this.workspaceRepository.find({
      where: {
        state: Not(In([WorkspaceState.DESTROYED, WorkspaceState.ERROR])),
        desiredState: Raw(
          () =>
            `"Workspace"."desiredState"::text != "Workspace"."state"::text AND "Workspace"."desiredState"::text != 'archived'`,
        ),
      },
      take: 100,
      order: {
        lastActivityAt: 'DESC',
      },
    })

    await Promise.all(
      workspaces.map(async (workspace) => {
        this.syncInstanceState(workspace.id)
      }),
    )
    await this.redisLockProvider.unlock(lockKey)
  }

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'sync-archived-desired-states' })
  async syncArchivedDesiredStates(): Promise<void> {
    const lockKey = 'sync-archived-desired-states'
    if (!(await this.redisLockProvider.lock(lockKey, 30))) {
      return
    }

    const nodesWith3InProgress = await this.workspaceRepository
      .createQueryBuilder('workspace')
      .select('"nodeId"')
      .where('"workspace"."state" = :state', { state: WorkspaceState.ARCHIVING })
      .groupBy('"nodeId"')
      .having('COUNT(*) >= 3')
      .getRawMany()

    const workspaces = await this.workspaceRepository.find({
      where: [
        {
          state: WorkspaceState.ARCHIVING,
          desiredState: WorkspaceDesiredState.ARCHIVED,
        },
        {
          state: Not(In([WorkspaceState.ARCHIVED, WorkspaceState.DESTROYED, WorkspaceState.ERROR])),
          desiredState: WorkspaceDesiredState.ARCHIVED,
          nodeId: Not(In(nodesWith3InProgress.map((node) => node.nodeId))),
        },
      ],
      take: 100,
      order: {
        lastActivityAt: 'DESC',
      },
    })

    await Promise.all(
      workspaces.map(async (workspace) => {
        this.syncInstanceState(workspace.id)
      }),
    )
    await this.redisLockProvider.unlock(lockKey)
  }

  async syncInstanceState(workspaceId: string): Promise<void> {
    //  prevent syncState cron from running multiple instances of the same workspace
    const lockKey = SYNC_INSTANCE_STATE_LOCK_KEY + workspaceId
    const acquired = await this.redisLockProvider.lock(lockKey, 360)
    if (!acquired) {
      return
    }

    const workspace = await this.workspaceRepository.findOneByOrFail({
      id: workspaceId,
    })

    if (workspace.state === WorkspaceState.ERROR) {
      await this.redisLockProvider.unlock(lockKey)
      return
    }

    let shouldSyncAgain = DONT_SYNC_AGAIN

    try {
      switch (workspace.desiredState) {
        case WorkspaceDesiredState.STARTED: {
          shouldSyncAgain = await this.handleWorkspaceDesiredStateStarted(workspace)
          break
        }
        case WorkspaceDesiredState.STOPPED: {
          shouldSyncAgain = await this.handleWorkspaceDesiredStateStopped(workspace)
          break
        }
        case WorkspaceDesiredState.DESTROYED: {
          shouldSyncAgain = await this.handleWorkspaceDesiredStateDestroyed(workspace)
          break
        }
        case WorkspaceDesiredState.ARCHIVED: {
          shouldSyncAgain = await this.handleWorkspaceDesiredStateArchived(workspace)
          break
        }
      }
    } catch (error) {
      if (error.code === 'ECONNRESET') {
        shouldSyncAgain = SYNC_AGAIN
      } else {
        this.logger.error(`Error processing desired state for workspace ${workspaceId}:`, fromAxiosError(error))

        const workspace = await this.workspaceRepository.findOneBy({
          id: workspaceId,
        })
        if (!workspace) {
          //  edge case where workspace is deleted while desired state is being processed
          return
        }
        await this.updateWorkspaceErrorState(workspace.id, error.message || String(error))
      }
    }

    await this.redisLockProvider.unlock(lockKey)
    if (shouldSyncAgain) {
      this.syncInstanceState(workspaceId)
    }
  }

  private handleUnassignedBuildWorkspace: StateSyncHandler = async (workspace: Workspace): Promise<ShouldSyncAgain> => {
    // Try to assign an available node with the image build
    let nodeId: string
    try {
      nodeId = await this.nodeService.getRandomAvailableNode({
        region: workspace.region,
        workspaceClass: workspace.class,
        imageRef: workspace.buildInfo.imageRef,
      })
    } catch (error) {
      // Continue to next assignment method
    }

    if (nodeId) {
      await this.updateWorkspaceState(workspace.id, WorkspaceState.UNKNOWN, nodeId)
      return SYNC_AGAIN
    }

    // Try to assign an available node that is currently building the image
    const imageNodes = await this.nodeService.getImageNodes(workspace.buildInfo.imageRef)

    for (const imageNode of imageNodes) {
      const node = await this.nodeService.findOne(imageNode.nodeId)
      if (node.used < node.capacity) {
        if (imageNode.state === ImageNodeState.BUILDING_IMAGE) {
          await this.updateWorkspaceState(workspace.id, WorkspaceState.BUILDING_IMAGE, node.id)
          return SYNC_AGAIN
        } else if (imageNode.state === ImageNodeState.ERROR) {
          await this.updateWorkspaceErrorState(workspace.id, imageNode.errorReason)
          return DONT_SYNC_AGAIN
        }
      }
    }

    const excludedNodeIds = await this.nodeService.getNodesWithMultipleImagesBuilding()

    // Try to assign a new available node
    nodeId = await this.nodeService.getRandomAvailableNode({
      region: workspace.region,
      workspaceClass: workspace.class,
      excludedNodeIds: excludedNodeIds,
    })

    this.buildOnNode(workspace.buildInfo, nodeId, workspace.organizationId)

    await this.updateWorkspaceState(workspace.id, WorkspaceState.BUILDING_IMAGE, nodeId)
    await this.nodeService.recalculateNodeUsage(nodeId)
    return SYNC_AGAIN
  }

  // Initiates the image build on the runner and creates an ImageNode depending on the result
  async buildOnNode(buildInfo: BuildInfo, nodeId: string, organizationId: string) {
    const node = await this.nodeService.findOne(nodeId)
    const nodeImageApi = this.nodeApiFactory.createImageApi(node)

    let retries = 0

    while (retries < 10) {
      try {
        await nodeImageApi.buildImage({
          image: buildInfo.imageRef,
          organizationId: organizationId,
          dockerfile: buildInfo.dockerfileContent,
          context: buildInfo.contextHashes,
        })
        break
      } catch (err) {
        if (err.code !== 'ECONNRESET') {
          await this.nodeService.createImageNode(nodeId, buildInfo.imageRef, ImageNodeState.ERROR, err.message)
          return
        }
      }
      retries++
      await new Promise((resolve) => setTimeout(resolve, retries * 1000))
    }

    if (retries === 10) {
      await this.nodeService.createImageNode(nodeId, buildInfo.imageRef, ImageNodeState.ERROR, 'Timeout while building')
      return
    }

    const response = (await nodeImageApi.imageExists(buildInfo.imageRef)).data
    let state = ImageNodeState.BUILDING_IMAGE
    if (response && response.exists) {
      state = ImageNodeState.READY
    }

    await this.nodeService.createImageNode(nodeId, buildInfo.imageRef, state)
  }

  private handleWorkspaceDesiredStateArchived: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    const lockKey = 'archive-lock-' + workspace.nodeId
    if (!(await this.redisLockProvider.lock(lockKey, 10))) {
      return DONT_SYNC_AGAIN
    }

    const inProgressOnNode = await this.workspaceRepository.find({
      where: {
        nodeId: workspace.nodeId,
        state: In([WorkspaceState.ARCHIVING]),
      },
      order: {
        lastActivityAt: 'DESC',
      },
      take: 100,
    })

    //  if the workspace is already in progress, continue
    if (!inProgressOnNode.find((w) => w.id === workspace.id)) {
      //  max 3 workspaces can be archived at the same time on the same node
      //  this is to prevent the node from being overloaded
      if (inProgressOnNode.length > 2) {
        await this.redisLockProvider.unlock(lockKey)
        return
      }
    }

    switch (workspace.state) {
      case WorkspaceState.STOPPED: {
        await this.updateWorkspaceState(workspace.id, WorkspaceState.ARCHIVING)
        //  fallthrough to archiving state
      }
      case WorkspaceState.ARCHIVING: {
        await this.redisLockProvider.unlock(lockKey)

        //  if the snapshot state is error, we need to retry the snapshot
        if (workspace.snapshotState === SnapshotState.ERROR) {
          const archiveErrorRetryKey = 'archive-error-retry-' + workspace.id
          const archiveErrorRetryCountRaw = await this.redis.get(archiveErrorRetryKey)
          const archiveErrorRetryCount = archiveErrorRetryCountRaw ? parseInt(archiveErrorRetryCountRaw) : 0
          //  if the archive error retry count is greater than 3, we need to mark the workspace as error
          if (archiveErrorRetryCount > 3) {
            await this.updateWorkspaceErrorState(workspace.id, 'Failed to archive workspace')
            await this.redis.del(archiveErrorRetryKey)
            return DONT_SYNC_AGAIN
          }
          await this.redis.setex('archive-error-retry-' + workspace.id, 720, String(archiveErrorRetryCount + 1))

          //  reset the snapshot state to pending to retry the snapshot
          await this.workspaceRepository.update(workspace.id, {
            snapshotState: SnapshotState.PENDING,
          })

          return DONT_SYNC_AGAIN
        }

        // Check for timeout - if more than 30 minutes since last activity
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
        if (workspace.lastActivityAt < thirtyMinutesAgo) {
          await this.updateWorkspaceErrorState(workspace.id, 'Archiving operation timed out')
          return DONT_SYNC_AGAIN
        }

        if (workspace.snapshotState !== SnapshotState.COMPLETED) {
          return DONT_SYNC_AGAIN
        }

        //  when the snapshot is completed, destroy the workspace on the node
        //  and deassociate the workspace from the node
        const node = await this.nodeService.findOne(workspace.nodeId)
        const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)

        try {
          const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
          const workspaceInfo = workspaceInfoResponse.data
          switch (workspaceInfo.state) {
            case NodeWorkspaceState.SandboxStateDestroying:
              //  wait until workspace is destroyed on node
              return SYNC_AGAIN
            case NodeWorkspaceState.SandboxStateDestroyed:
              await this.updateWorkspaceState(workspace.id, WorkspaceState.ARCHIVED, null)
              return DONT_SYNC_AGAIN
            default:
              await nodeWorkspaceApi.destroy(workspace.id)
              return SYNC_AGAIN
          }
        } catch (error) {
          //  fail for errors other than workspace not found or workspace already destroyed
          if (
            !(
              (error.response?.data?.statusCode === 400 &&
                error.response?.data?.message.includes('Workspace already destroyed')) ||
              error.response?.status === 404
            )
          ) {
            throw error
          }
          //  if the workspace is already destroyed, do nothing
          await this.updateWorkspaceState(workspace.id, WorkspaceState.ARCHIVED, null)
          return DONT_SYNC_AGAIN
        }
      }
    }

    return DONT_SYNC_AGAIN
  }

  private handleWorkspaceDesiredStateDestroyed: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    if (workspace.state === WorkspaceState.ARCHIVED) {
      await this.updateWorkspaceState(workspace.id, WorkspaceState.DESTROYED)
      return DONT_SYNC_AGAIN
    }

    const node = await this.nodeService.findOne(workspace.nodeId)
    if (node.state !== NodeState.READY) {
      //  console.debug(`Node ${node.id} is not ready`);
      return DONT_SYNC_AGAIN
    }

    switch (workspace.state) {
      case WorkspaceState.DESTROYED:
        return DONT_SYNC_AGAIN
      case WorkspaceState.DESTROYING: {
        // check if workspace is destroyed
        const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)

        try {
          const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
          const workspaceInfo = workspaceInfoResponse.data
          if (
            workspaceInfo.state === NodeWorkspaceState.SandboxStateDestroyed ||
            workspaceInfo.state === NodeWorkspaceState.SandboxStateError
          ) {
            await nodeWorkspaceApi.removeDestroyed(workspace.id)
          }
        } catch (e) {
          //  if the workspace is not found on node, it is already destroyed
          if (!e.response || e.response.status !== 404) {
            throw e
          }
        }

        await this.updateWorkspaceState(workspace.id, WorkspaceState.DESTROYED)
        return SYNC_AGAIN
      }
      default: {
        // destroy workspace
        try {
          const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
          const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
          const workspaceInfo = workspaceInfoResponse.data
          if (workspaceInfo?.state === NodeWorkspaceState.SandboxStateDestroyed) {
            return DONT_SYNC_AGAIN
          }
          await nodeWorkspaceApi.destroy(workspace.id)
        } catch (e) {
          //  if the workspace is not found on node, it is already destroyed
          if (e.response.status !== 404) {
            throw e
          }
        }
        await this.updateWorkspaceState(workspace.id, WorkspaceState.DESTROYING)
        return SYNC_AGAIN
      }
    }
  }

  private handleWorkspaceDesiredStateStarted: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    switch (workspace.state) {
      case WorkspaceState.PENDING_BUILD: {
        return this.handleUnassignedBuildWorkspace(workspace)
      }
      case WorkspaceState.BUILDING_IMAGE: {
        return this.handleNodeWorkspaceBuildingImageStateOnDesiredStateStart(workspace)
      }
      case WorkspaceState.UNKNOWN: {
        return this.handleNodeWorkspaceUnknownStateOnDesiredStateStart(workspace)
      }
      case WorkspaceState.ARCHIVED:
      case WorkspaceState.STOPPED: {
        return this.handleNodeWorkspaceStoppedOrArchivedStateOnDesiredStateStart(workspace)
      }
      case WorkspaceState.RESTORING:
      case WorkspaceState.CREATING: {
        return this.handleNodeWorkspacePullingImageStateCheck(workspace)
      }
      case WorkspaceState.PULLING_IMAGE:
      case WorkspaceState.STARTING: {
        return this.handleNodeWorkspaceStartedStateCheck(workspace)
      }
      //  TODO: remove this case
      case WorkspaceState.ERROR: {
        //  TODO: remove this asap
        //  this was a temporary solution to recover from the false positive error state
        if (workspace.id.startsWith('err_')) {
          return DONT_SYNC_AGAIN
        }
        const node = await this.nodeService.findOne(workspace.nodeId)
        const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
        const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
        const workspaceInfo = workspaceInfoResponse.data
        if (workspaceInfo.state === NodeWorkspaceState.SandboxStateStarted) {
          const workspaceToUpdate = await this.workspaceRepository.findOneByOrFail({
            id: workspace.id,
          })
          workspaceToUpdate.state = WorkspaceState.STARTED
          workspaceToUpdate.snapshotState = SnapshotState.NONE
          await this.workspaceRepository.save(workspaceToUpdate)
        }
      }
    }

    return DONT_SYNC_AGAIN
  }

  private handleWorkspaceDesiredStateStopped: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    const node = await this.nodeService.findOne(workspace.nodeId)
    if (node.state !== NodeState.READY) {
      //  console.debug(`Node ${node.id} is not ready`);
      return DONT_SYNC_AGAIN
    }

    switch (workspace.state) {
      case WorkspaceState.STARTED: {
        // stop workspace
        const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
        await nodeWorkspaceApi.stop(workspace.id)
        await this.updateWorkspaceState(workspace.id, WorkspaceState.STOPPING)
        //  sync states again immediately for workspace
        return SYNC_AGAIN
      }
      case WorkspaceState.STOPPING: {
        // check if workspace is stopped
        const node = await this.nodeService.findOne(workspace.nodeId)
        const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
        const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
        const workspaceInfo = workspaceInfoResponse.data
        switch (workspaceInfo.state) {
          case NodeWorkspaceState.SandboxStateStopped: {
            const workspaceToUpdate = await this.workspaceRepository.findOneByOrFail({
              id: workspace.id,
            })
            workspaceToUpdate.state = WorkspaceState.STOPPED
            workspaceToUpdate.snapshotState = SnapshotState.NONE
            await this.workspaceRepository.save(workspaceToUpdate)
            return SYNC_AGAIN
          }
          case NodeWorkspaceState.SandboxStateError: {
            await this.updateWorkspaceErrorState(workspace.id, 'Sandbox is in error state on runner')
            return DONT_SYNC_AGAIN
          }
        }
        return SYNC_AGAIN
      }
      case WorkspaceState.ERROR: {
        if (workspace.id.startsWith('err_')) {
          return DONT_SYNC_AGAIN
        }
        const node = await this.nodeService.findOne(workspace.nodeId)
        const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
        const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
        const workspaceInfo = workspaceInfoResponse.data
        if (workspaceInfo.state === NodeWorkspaceState.SandboxStateStopped) {
          await this.updateWorkspaceState(workspace.id, WorkspaceState.STOPPED)
        }
      }
    }

    return DONT_SYNC_AGAIN
  }

  private handleNodeWorkspaceBuildingImageStateOnDesiredStateStart: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    const imageNode = await this.nodeService.getImageNode(workspace.nodeId, workspace.buildInfo.imageRef)
    if (imageNode) {
      switch (imageNode.state) {
        case ImageNodeState.READY: {
          // TODO: "UNKNOWN" should probably be changed to something else
          await this.updateWorkspaceState(workspace.id, WorkspaceState.UNKNOWN)
          return SYNC_AGAIN
        }
        case ImageNodeState.ERROR: {
          await this.updateWorkspaceErrorState(workspace.id, imageNode.errorReason)
          return DONT_SYNC_AGAIN
        }
      }
    }
    if (!imageNode || imageNode.state === ImageNodeState.BUILDING_IMAGE) {
      // Sleep for a second and go back to syncing instance state
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return SYNC_AGAIN
    }

    return DONT_SYNC_AGAIN
  }

  private handleNodeWorkspaceUnknownStateOnDesiredStateStart: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    const node = await this.nodeService.findOne(workspace.nodeId)
    if (node.state !== NodeState.READY) {
      //  console.debug(`Node ${node.id} is not ready`);
      return DONT_SYNC_AGAIN
    }

    let createWorkspaceDto: CreateSandboxDTO = {
      id: workspace.id,
      osUser: workspace.osUser,
      image: '',
      // TODO: organizationId: workspace.organizationId,
      userId: workspace.organizationId,
      storageQuota: workspace.disk,
      memoryQuota: workspace.mem,
      cpuQuota: workspace.cpu,
      // gpuQuota: workspace.gpu,
      env: workspace.env,
      // public: workspace.public,
      volumes: workspace.volumes,
    }

    if (!workspace.buildInfo) {
      //  get internal image name
      const image = await this.imageService.getImageByName(workspace.image, workspace.organizationId)
      const internalImageName = image.internalName

      const registry = await this.dockerRegistryService.findOneByImageName(internalImageName, workspace.organizationId)
      if (!registry) {
        throw new Error('No registry found for image')
      }

      createWorkspaceDto = {
        ...createWorkspaceDto,
        image: internalImageName,
        entrypoint: image.entrypoint,
        registry: {
          url: registry.url,
          username: registry.username,
          password: registry.password,
        },
      }
    } else {
      createWorkspaceDto = {
        ...createWorkspaceDto,
        image: workspace.buildInfo.imageRef,
        entrypoint: this.getEntrypointFromDockerfile(workspace.buildInfo.dockerfileContent),
      }
    }

    const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
    await nodeWorkspaceApi.create(createWorkspaceDto)
    await this.updateWorkspaceState(workspace.id, WorkspaceState.CREATING)
    //  sync states again immediately for workspace
    return SYNC_AGAIN
  }

  // TODO: revise/cleanup
  private getEntrypointFromDockerfile(dockerfileContent: string): string[] {
    // Match ENTRYPOINT with either a string or JSON array
    const entrypointMatch = dockerfileContent.match(/ENTRYPOINT\s+(.*)/)
    if (entrypointMatch) {
      const rawEntrypoint = entrypointMatch[1].trim()
      try {
        // Try parsing as JSON array
        const parsed = JSON.parse(rawEntrypoint)
        if (Array.isArray(parsed)) {
          return parsed
        }
      } catch {
        // Fallback: it's probably a plain string
        return [rawEntrypoint.replace(/["']/g, '')]
      }
    }

    // Match CMD with either a string or JSON array
    const cmdMatch = dockerfileContent.match(/CMD\s+(.*)/)
    if (cmdMatch) {
      const rawCmd = cmdMatch[1].trim()
      try {
        const parsed = JSON.parse(rawCmd)
        if (Array.isArray(parsed)) {
          return parsed
        }
      } catch {
        return [rawCmd.replace(/["']/g, '')]
      }
    }

    return ['sleep', 'infinity']
  }

  private handleNodeWorkspaceStoppedOrArchivedStateOnDesiredStateStart: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    //  check if workspace is assigned to a node and if that node is unschedulable
    //  if it is, move workspace to prevNodeId, and set nodeId to null
    //  this will assign a new node to the workspace and restore the workspace from the latest snapshot
    if (workspace.nodeId) {
      const node = await this.nodeService.findOne(workspace.nodeId)
      if (node.unschedulable) {
        //  check if workspace has a valid snapshot
        if (workspace.snapshotState !== SnapshotState.COMPLETED) {
          //  if not, keep workspace on the same node
        } else {
          workspace.prevNodeId = workspace.nodeId
          workspace.nodeId = null

          const workspaceToUpdate = await this.workspaceRepository.findOneByOrFail({
            id: workspace.id,
          })
          workspaceToUpdate.prevNodeId = workspace.nodeId
          workspaceToUpdate.nodeId = null
          await this.workspaceRepository.save(workspaceToUpdate)
        }
      }

      if (workspace.snapshotState === SnapshotState.COMPLETED) {
        const usageThreshold = 35
        const runningWorkspacesCount = await this.workspaceRepository.count({
          where: {
            nodeId: workspace.nodeId,
            state: WorkspaceState.STARTED,
          },
        })
        if (runningWorkspacesCount > usageThreshold) {
          //  TODO: usage should be based on compute usage

          const image = await this.imageService.getImageByName(workspace.image, workspace.organizationId)
          const availableNodes = await this.nodeService.findAvailableNodes({
            region: workspace.region,
            workspaceClass: workspace.class,
            imageRef: image.internalName,
          })
          const lessUsedNodes = availableNodes.filter((node) => node.id !== workspace.nodeId)

          //  temp workaround to move workspaces to less used node
          if (lessUsedNodes.length > 0) {
            await this.workspaceRepository.update(workspace.id, {
              nodeId: null,
              prevNodeId: workspace.nodeId,
            })
            try {
              const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
              await nodeWorkspaceApi.removeDestroyed(workspace.id)
            } catch (e) {
              this.logger.error(
                `Failed to cleanup workspace ${workspace.id} on previous node ${node.id}:`,
                fromAxiosError(e),
              )
            }
            workspace.prevNodeId = workspace.nodeId
            workspace.nodeId = null
          }
        }
      }
    }

    if (workspace.nodeId === null) {
      //  if workspace has no node, check if snapshot is completed
      //  if not, set workspace to error
      //  if snapshot is completed, get random available node and start workspace
      //  use the snapshot image to start the workspace

      if (workspace.snapshotState !== SnapshotState.COMPLETED) {
        await this.updateWorkspaceErrorState(workspace.id, 'Workspace has no node and snapshot is not completed')
        return true
      }

      const registry = await this.dockerRegistryService.findOne(workspace.snapshotRegistryId)
      if (!registry) {
        throw new Error('No registry found for image')
      }

      const existingImages = workspace.existingSnapshotImages.map((existingImage) => existingImage.imageName)
      let validSnapshotImage
      let exists = false

      while (existingImages.length > 0) {
        try {
          if (!validSnapshotImage) {
            //  last image is the current image, so we don't need to check it
            //  just in case, we'll use the value from the snapshotImage property
            validSnapshotImage = workspace.snapshotImage
            existingImages.pop()
          } else {
            validSnapshotImage = existingImages.pop()
          }
          if (await this.dockerProvider.checkImageExistsInRegistry(validSnapshotImage, registry)) {
            exists = true
            break
          }
        } catch (error) {
          this.logger.error(
            `Failed to check if snapshot image ${workspace.snapshotImage} exists in registry ${registry.id}:`,
            fromAxiosError(error),
          )
        }
      }

      if (!exists) {
        await this.updateWorkspaceErrorState(workspace.id, 'No valid snapshot image found')
        return SYNC_AGAIN
      }

      const image = await this.imageService.getImageByName(workspace.image, workspace.organizationId)

      //  exclude the node that the last node workspace was on
      const availableNodes = (
        await this.nodeService.findAvailableNodes({
          region: workspace.region,
          workspaceClass: workspace.class,
          imageRef: image.internalName,
        })
      ).filter((node) => node.id != workspace.prevNodeId)

      //  get random node from available nodes
      const randomNodeIndex = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min)
      const nodeId = availableNodes[randomNodeIndex(0, availableNodes.length - 1)].id

      const node = await this.nodeService.findOne(nodeId)

      const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)

      await nodeWorkspaceApi.create({
        id: workspace.id,
        image: validSnapshotImage,
        osUser: workspace.osUser,
        // TODO: organizationId: workspace.organizationId,
        userId: workspace.organizationId,
        storageQuota: workspace.disk,
        memoryQuota: workspace.mem,
        cpuQuota: workspace.cpu,
        // gpuQuota: workspace.gpu,
        env: workspace.env,
        // public: workspace.public,
        registry: {
          url: registry.url,
          username: registry.username,
          password: registry.password,
        },
      })

      await this.updateWorkspaceState(workspace.id, WorkspaceState.RESTORING, nodeId)
    } else {
      // if workspace has node, start workspace
      const node = await this.nodeService.findOne(workspace.nodeId)

      const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)

      await nodeWorkspaceApi.start(workspace.id)

      await this.updateWorkspaceState(workspace.id, WorkspaceState.STARTING)
      return SYNC_AGAIN
    }

    return SYNC_AGAIN
  }

  //  used to check if workspace is pulling image on node and update workspace state accordingly
  private handleNodeWorkspacePullingImageStateCheck: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    //  edge case when workspace is being transferred to a new node
    if (!workspace.nodeId) {
      return SYNC_AGAIN
    }

    const node = await this.nodeService.findOne(workspace.nodeId)
    const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
    const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
    const workspaceInfo = workspaceInfoResponse.data

    if (workspaceInfo.state === NodeWorkspaceState.SandboxStatePullingImage) {
      await this.updateWorkspaceState(workspace.id, WorkspaceState.PULLING_IMAGE)
    } else if (workspaceInfo.state === NodeWorkspaceState.SandboxStateError) {
      await this.updateWorkspaceErrorState(workspace.id)
    } else {
      await this.updateWorkspaceState(workspace.id, WorkspaceState.STARTING)
    }

    return SYNC_AGAIN
  }

  //  used to check if workspace is started on node and update workspace state accordingly
  //  also used to handle the case where a workspace is started on a node and then transferred to a new node
  private handleNodeWorkspaceStartedStateCheck: StateSyncHandler = async (
    workspace: Workspace,
  ): Promise<ShouldSyncAgain> => {
    const node = await this.nodeService.findOne(workspace.nodeId)
    const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
    const workspaceInfoResponse = await nodeWorkspaceApi.info(workspace.id)
    const workspaceInfo = workspaceInfoResponse.data

    switch (workspaceInfo.state) {
      case NodeWorkspaceState.SandboxStateStarted: {
        //  if previous snapshot state is error or completed, set snapshot state to none
        if ([SnapshotState.ERROR, SnapshotState.COMPLETED].includes(workspace.snapshotState)) {
          workspace.snapshotState = SnapshotState.NONE

          const workspaceToUpdate = await this.workspaceRepository.findOneByOrFail({
            id: workspace.id,
          })
          workspaceToUpdate.state = WorkspaceState.STARTED
          workspaceToUpdate.snapshotState = SnapshotState.NONE
          await this.workspaceRepository.save(workspaceToUpdate)
        } else {
          await this.updateWorkspaceState(workspace.id, WorkspaceState.STARTED)
        }

        //  if workspace was transferred to a new node, remove it from the old node
        if (workspace.prevNodeId) {
          const node = await this.nodeService.findOne(workspace.prevNodeId)
          if (!node) {
            this.logger.warn(`Previously assigned node ${workspace.prevNodeId} for workspace ${workspace.id} not found`)
            //  clear prevNodeId to avoid trying to cleanup on a non-existent node
            workspace.prevNodeId = null

            const workspaceToUpdate = await this.workspaceRepository.findOneByOrFail({
              id: workspace.id,
            })
            workspaceToUpdate.prevNodeId = null
            await this.workspaceRepository.save(workspaceToUpdate)
            break
          }
          const nodeWorkspaceApi = this.nodeApiFactory.createWorkspaceApi(node)
          try {
            // First try to destroy the workspace
            await nodeWorkspaceApi.destroy(workspace.id)

            // Wait for workspace to be destroyed before removing
            let retries = 0
            while (retries < 10) {
              try {
                const workspaceInfo = await nodeWorkspaceApi.info(workspace.id)
                if (workspaceInfo.data.state === NodeWorkspaceState.SandboxStateDestroyed) {
                  break
                }
              } catch (e) {
                if (e.response?.status === 404) {
                  break // Workspace already gone
                }
                throw e
              }
              await new Promise((resolve) => setTimeout(resolve, 1000 * retries))
              retries++
            }

            // Finally remove the destroyed workspace
            await nodeWorkspaceApi.removeDestroyed(workspace.id)
            workspace.prevNodeId = null

            const workspaceToUpdate = await this.workspaceRepository.findOneByOrFail({
              id: workspace.id,
            })
            workspaceToUpdate.prevNodeId = null
            await this.workspaceRepository.save(workspaceToUpdate)
          } catch (e) {
            this.logger.error(
              `Failed to cleanup workspace ${workspace.id} on previous node ${node.id}:`,
              fromAxiosError(e),
            )
          }
        }
        break
      }
      case NodeWorkspaceState.SandboxStateError: {
        await this.updateWorkspaceErrorState(workspace.id)
        break
      }
    }

    return SYNC_AGAIN
  }

  private async updateWorkspaceState(workspaceId: string, state: WorkspaceState, nodeId?: string | null | undefined) {
    const workspace = await this.workspaceRepository.findOneByOrFail({
      id: workspaceId,
    })
    if (workspace.state === state) {
      return
    }
    workspace.state = state
    if (nodeId !== undefined) {
      workspace.nodeId = nodeId
    }

    await this.workspaceRepository.save(workspace)
  }

  private async updateWorkspaceErrorState(workspaceId: string, errorReason?: string) {
    const workspace = await this.workspaceRepository.findOneByOrFail({
      id: workspaceId,
    })
    workspace.state = WorkspaceState.ERROR
    if (errorReason !== undefined) {
      workspace.errorReason = errorReason
    }
    await this.workspaceRepository.save(workspace)
  }

  @OnEvent(WorkspaceEvents.ARCHIVED)
  private async handleWorkspaceArchivedEvent(event: WorkspaceArchivedEvent) {
    this.syncInstanceState(event.workspace.id).catch(this.logger.error)
  }

  @OnEvent(WorkspaceEvents.DESTROYED)
  private async handleWorkspaceDestroyedEvent(event: WorkspaceDestroyedEvent) {
    this.syncInstanceState(event.workspace.id).catch(this.logger.error)
  }

  @OnEvent(WorkspaceEvents.STARTED)
  private async handleWorkspaceStartedEvent(event: WorkspaceStartedEvent) {
    this.syncInstanceState(event.workspace.id).catch(this.logger.error)
  }

  @OnEvent(WorkspaceEvents.STOPPED)
  private async handleWorkspaceStoppedEvent(event: WorkspaceStoppedEvent) {
    this.syncInstanceState(event.workspace.id).catch(this.logger.error)
  }

  @OnEvent(WorkspaceEvents.CREATED)
  private async handleWorkspaceCreatedEvent(event: WorkspaceCreatedEvent) {
    this.syncInstanceState(event.workspace.id).catch(this.logger.error)
  }
}
