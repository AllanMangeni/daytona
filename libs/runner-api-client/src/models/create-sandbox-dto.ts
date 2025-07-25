/* tslint:disable */
/* eslint-disable */
/**
 * Daytona Runner API
 * Daytona Runner API
 *
 * The version of the OpenAPI document: v0.0.0-dev
 *
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

// May contain unused imports in some cases
// @ts-ignore
import type { DtoVolumeDTO } from './dto-volume-dto'
// May contain unused imports in some cases
// @ts-ignore
import type { RegistryDTO } from './registry-dto'

/**
 *
 * @export
 * @interface CreateSandboxDTO
 */
export interface CreateSandboxDTO {
  /**
   *
   * @type {number}
   * @memberof CreateSandboxDTO
   */
  cpuQuota?: number
  /**
   *
   * @type {Array<string>}
   * @memberof CreateSandboxDTO
   */
  entrypoint?: Array<string>
  /**
   *
   * @type {{ [key: string]: string; }}
   * @memberof CreateSandboxDTO
   */
  env?: { [key: string]: string }
  /**
   *
   * @type {string}
   * @memberof CreateSandboxDTO
   */
  fromVolumeId?: string
  /**
   *
   * @type {number}
   * @memberof CreateSandboxDTO
   */
  gpuQuota?: number
  /**
   *
   * @type {string}
   * @memberof CreateSandboxDTO
   */
  id: string
  /**
   *
   * @type {number}
   * @memberof CreateSandboxDTO
   */
  memoryQuota?: number
  /**
   *
   * @type {string}
   * @memberof CreateSandboxDTO
   */
  osUser: string
  /**
   *
   * @type {RegistryDTO}
   * @memberof CreateSandboxDTO
   */
  registry?: RegistryDTO
  /**
   *
   * @type {string}
   * @memberof CreateSandboxDTO
   */
  snapshot: string
  /**
   *
   * @type {number}
   * @memberof CreateSandboxDTO
   */
  storageQuota?: number
  /**
   *
   * @type {string}
   * @memberof CreateSandboxDTO
   */
  userId: string
  /**
   *
   * @type {Array<DtoVolumeDTO>}
   * @memberof CreateSandboxDTO
   */
  volumes?: Array<DtoVolumeDTO>
}
