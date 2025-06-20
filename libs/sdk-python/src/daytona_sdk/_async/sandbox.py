# Copyright 2025 Daytona Platforms Inc.
# SPDX-License-Identifier: AGPL-3.0

import json
import time
from typing import Dict, Optional

from daytona_api_client_async import PortPreviewUrl, ToolboxApi
from daytona_api_client_async import Workspace as ApiSandbox
from daytona_api_client_async import WorkspaceApi as SandboxApi
from daytona_sdk._async.filesystem import AsyncFileSystem
from daytona_sdk._async.git import AsyncGit
from daytona_sdk._async.lsp_server import AsyncLspServer, LspLanguageId
from daytona_sdk._async.process import AsyncProcess
from daytona_sdk._utils.enum import to_enum
from daytona_sdk._utils.errors import intercept_errors
from daytona_sdk._utils.path import prefix_relative_path
from daytona_sdk._utils.timeout import with_timeout
from daytona_sdk.common.errors import DaytonaError
from daytona_sdk.common.protocols import SandboxCodeToolbox
from daytona_sdk.common.sandbox import SandboxInfo, SandboxInstance, SandboxResources, SandboxTargetRegion
from deprecated import deprecated


class AsyncSandbox:
    """Represents a Daytona Sandbox.

    Attributes:
        id (str): Unique identifier for the Sandbox.
        instance (SandboxInstance): The underlying Sandbox instance.
        code_toolbox (SandboxCodeToolbox): Language-specific toolbox implementation.
        fs (AsyncFileSystem): File system operations interface.
        git (AsyncGit): Git operations interface.
        process (AsyncProcess): Process execution interface.
    """

    def __init__(
        self,
        id: str,
        instance: SandboxInstance,
        sandbox_api: SandboxApi,
        toolbox_api: ToolboxApi,
        code_toolbox: SandboxCodeToolbox,
    ):
        """Initialize a new Sandbox instance.

        Args:
            id (str): Unique identifier for the Sandbox.
            instance (SandboxInstance): The underlying Sandbox instance.
            sandbox_api (SandboxApi): API client for Sandbox operations.
            toolbox_api (ToolboxApi): API client for toolbox operations.
            code_toolbox (SandboxCodeToolbox): Language-specific toolbox implementation.
        """
        self.id = id
        self.instance = instance
        self.sandbox_api = sandbox_api
        self.toolbox_api = toolbox_api
        self._code_toolbox = code_toolbox
        self._root_dir = ""

        self.fs = AsyncFileSystem(instance, toolbox_api, self.__get_root_dir)
        self.git = AsyncGit(toolbox_api, instance, self.__get_root_dir)
        self.process = AsyncProcess(code_toolbox, toolbox_api, instance, self.__get_root_dir)

    async def info(self) -> SandboxInfo:
        """Gets structured information about the Sandbox.

        Returns:
            SandboxInfo: Detailed information about the Sandbox including its
                configuration, resources, and current state.

        Example:
            ```python
            info = await sandbox.info()
            print(f"Sandbox {info.id}:")
            print(f"State: {info.state}")
            print(f"Resources: {info.resources.cpu} CPU, {info.resources.memory} RAM")
            ```
        """
        instance = await self.sandbox_api.get_workspace(self.id)
        return AsyncSandbox.to_sandbox_info(instance)

    @intercept_errors(message_prefix="Failed to get sandbox root directory: ")
    async def get_user_root_dir(self) -> str:
        """Gets the root directory path for the logged in user inside the Sandbox.

        Returns:
            str: The absolute path to the Sandbox root directory for the logged in user.

        Example:
            ```python
            root_dir = await sandbox.get_user_root_dir()
            print(f"Sandbox root: {root_dir}")
            ```
        """
        response = await self.toolbox_api.get_project_dir(self.instance.id)
        return response.dir

    @deprecated(
        reason="Method is deprecated. Use `get_user_root_dir` instead. This method will be removed in a future version."
    )
    def get_workspace_root_dir(self) -> str:
        return self.get_user_root_dir()

    def create_lsp_server(self, language_id: LspLanguageId, path_to_project: str) -> AsyncLspServer:
        """Creates a new Language Server Protocol (LSP) server instance.

        The LSP server provides language-specific features like code completion,
        diagnostics, and more.

        Args:
            language_id (LspLanguageId): The language server type (e.g., LspLanguageId.PYTHON).
            path_to_project (str): Path to the project root directory. Relative paths are resolved based on the user's
            root directory.

        Returns:
            LspServer: A new LSP server instance configured for the specified language.

        Example:
            ```python
            lsp = sandbox.create_lsp_server("python", "workspace/project")
            ```
        """
        return AsyncLspServer(
            language_id,
            prefix_relative_path(self._root_dir, path_to_project),
            self.toolbox_api,
            self.instance,
        )

    @intercept_errors(message_prefix="Failed to set labels: ")
    async def set_labels(self, labels: Dict[str, str]) -> Dict[str, str]:
        """Sets labels for the Sandbox.

        Labels are key-value pairs that can be used to organize and identify Sandboxes.

        Args:
            labels (Dict[str, str]): Dictionary of key-value pairs representing Sandbox labels.

        Returns:
            Dict[str, str]: Dictionary containing the updated Sandbox labels.

        Example:
            ```python
            new_labels = sandbox.set_labels({
                "project": "my-project",
                "environment": "development",
                "team": "backend"
            })
            print(f"Updated labels: {new_labels}")
            ```
        """
        # Convert all values to strings and create the expected labels structure
        string_labels = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in labels.items()}
        labels_payload = {"labels": string_labels}
        return await self.sandbox_api.replace_labels(self.id, labels_payload)

    @intercept_errors(message_prefix="Failed to start sandbox: ")
    @with_timeout(
        error_message=lambda self, timeout: (
            f"Sandbox {self.id} failed to start within the {timeout} seconds timeout period"
        )
    )
    async def start(self, timeout: Optional[float] = 60):
        """Starts the Sandbox and waits for it to be ready.

        Args:
            timeout (Optional[float]): Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.

        Raises:
            DaytonaError: If timeout is negative. If sandbox fails to start or times out.

        Example:
            ```python
            sandbox = daytona.get_current_sandbox("my-sandbox")
            sandbox.start(timeout=40)  # Wait up to 40 seconds
            print("Sandbox started successfully")
            ```
        """
        await self.sandbox_api.start_workspace(self.id, _request_timeout=timeout or None)
        await self.wait_for_sandbox_start()

    @intercept_errors(message_prefix="Failed to stop sandbox: ")
    @with_timeout(
        error_message=lambda self, timeout: (
            f"Sandbox {self.id} failed to stop within the {timeout} seconds timeout period"
        )
    )
    async def stop(self, timeout: Optional[float] = 60):
        """Stops the Sandbox and waits for it to be fully stopped.

        Args:
            timeout (Optional[float]): Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.

        Raises:
            DaytonaError: If timeout is negative; If sandbox fails to stop or times out

        Example:
            ```python
            sandbox = daytona.get_current_sandbox("my-sandbox")
            sandbox.stop()
            print("Sandbox stopped successfully")
            ```
        """
        await self.sandbox_api.stop_workspace(self.id, _request_timeout=timeout or None)
        await self.wait_for_sandbox_stop()

    async def delete(self) -> None:
        """Deletes the Sandbox."""
        await self.sandbox_api.delete_workspace(self.id, force=True)

    @deprecated(
        reason=(
            "Method is deprecated. Use `wait_for_sandbox_start` instead. This method will be removed in a future"
            " version."
        )
    )
    async def wait_for_workspace_start(self, timeout: Optional[float] = 60) -> None:
        """Waits for the Sandbox to reach the 'started' state. Polls the Sandbox status until it
        reaches the 'started' state, encounters an error or times out.

        Args:
            timeout (Optional[float]): Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.

        Raises:
            DaytonaError: If timeout is negative; If Sandbox fails to start or times out
        """
        await self.wait_for_sandbox_start(timeout)

    @intercept_errors(message_prefix="Failure during waiting for sandbox to start: ")
    @with_timeout(
        error_message=lambda self, timeout: (
            f"Sandbox {self.id} failed to become ready within the {timeout} seconds timeout period"
        )
    )
    async def wait_for_sandbox_start(
        self,
        timeout: Optional[float] = 60,  # pylint: disable=unused-argument
    ) -> None:
        """Waits for the Sandbox to reach the 'started' state. Polls the Sandbox status until it
        reaches the 'started' state, encounters an error or times out.

        Args:
            timeout (Optional[float]): Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.

        Raises:
            DaytonaError: If timeout is negative; If Sandbox fails to start or times out
        """
        state = (await self.info()).state
        while state != "started":
            response = await self.sandbox_api.get_workspace(self.id)
            state = response.state

            if state == "error":
                raise DaytonaError(
                    f"Sandbox {self.id} failed to start with state: {state}, error reason: {response.error_reason}"
                )

            time.sleep(0.1)  # Wait 100ms between checks

    @deprecated(
        reason=(
            "Method is deprecated. Use `wait_for_sandbox_stop` instead. This method will be removed in a future"
            " version."
        )
    )
    async def wait_for_workspace_stop(self, timeout: Optional[float] = 60) -> None:
        """Waits for the Sandbox to reach the 'stopped' state. Polls the Sandbox status until it
        reaches the 'stopped' state, encounters an error or times out. It will wait up to 60 seconds
        for the Sandbox to stop.

        Args:
            timeout (Optional[float]): Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.

        Raises:
            DaytonaError: If timeout is negative. If Sandbox fails to stop or times out.
        """
        await self.wait_for_sandbox_stop(timeout)

    @intercept_errors(message_prefix="Failure during waiting for sandbox to stop: ")
    @with_timeout(
        error_message=lambda self, timeout: (
            f"Sandbox {self.id} failed to become stopped within the {timeout} seconds timeout period"
        )
    )
    async def wait_for_sandbox_stop(
        self,
        timeout: Optional[float] = 60,  # pylint: disable=unused-argument
    ) -> None:
        """Waits for the Sandbox to reach the 'stopped' state. Polls the Sandbox status until it
        reaches the 'stopped' state, encounters an error or times out. It will wait up to 60 seconds
        for the Sandbox to stop.

        Args:
            timeout (Optional[float]): Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.

        Raises:
            DaytonaError: If timeout is negative. If Sandbox fails to stop or times out.
        """
        state = (await self.info()).state
        while state != "stopped":
            try:
                response = await self.sandbox_api.get_workspace(self.id)
                state = response.state

                if state == "error":
                    raise DaytonaError(
                        f"Sandbox {self.id} failed to stop with status: {state}, error reason: {response.error_reason}"
                    )
            except Exception as e:
                # If there's a validation error, continue waiting
                if "validation error" not in str(e):
                    raise e

            time.sleep(0.1)  # Wait 100ms between checks

    @intercept_errors(message_prefix="Failed to set auto-stop interval: ")
    async def set_autostop_interval(self, interval: int) -> None:
        """Sets the auto-stop interval for the Sandbox.

        The Sandbox will automatically stop after being idle (no new events) for the specified interval.
        Events include any state changes or interactions with the Sandbox through the SDK.
        Interactions using Sandbox Previews are not included.

        Args:
            interval (int): Number of minutes of inactivity before auto-stopping.
                Set to 0 to disable auto-stop. Defaults to 15.

        Raises:
            DaytonaError: If interval is negative

        Example:
            ```python
            # Auto-stop after 1 hour
            sandbox.set_autostop_interval(60)
            # Or disable auto-stop
            sandbox.set_autostop_interval(0)
            ```
        """
        if not isinstance(interval, int) or interval < 0:
            raise DaytonaError("Auto-stop interval must be a non-negative integer")

        await self.sandbox_api.set_autostop_interval(self.id, interval)
        self.instance.auto_stop_interval = interval

    @intercept_errors(message_prefix="Failed to get preview link: ")
    async def get_preview_link(self, port: int) -> PortPreviewUrl:
        """Retrieves the preview link for the sandbox at the specified port. If the port is closed,
        it will be opened automatically. For private sandboxes, a token is included to grant access
        to the URL.

        Args:
            port (int): The port to open the preview link on.

        Returns:
            PortPreviewUrl: The response object for the preview link, which includes the `url`
            and the `token` (to access private sandboxes).

        Example:
            ```python
            preview_link = sandbox.get_preview_link(3000)
            print(f"Preview URL: {preview_link.url}")
            print(f"Token: {preview_link.token}")
            ```
        """
        return await self.sandbox_api.get_port_preview_url(self.id, port)

    @intercept_errors(message_prefix="Failed to archive sandbox: ")
    async def archive(self) -> None:
        """Archives the sandbox, making it inactive and preserving its state. When sandboxes are
        archived, the entire filesystem state is moved to cost-effective object storage, making it
        possible to keep sandboxes available for an extended period. The tradeoff between archived
        and stopped states is that starting an archived sandbox takes more time, depending on its size.
        Sandbox must be stopped before archiving.
        """
        await self.sandbox_api.archive_workspace(self.id)

    @staticmethod
    def to_sandbox_info(instance: ApiSandbox) -> SandboxInfo:
        """Converts an API Sandbox instance to a SandboxInfo object.

        Args:
            instance (ApiSandbox): The API Sandbox instance to convert

        Returns:
            SandboxInfo: The converted SandboxInfo object
        """
        provider_metadata = json.loads(instance.info.provider_metadata or "{}")

        # Extract resources with defaults
        resources = SandboxResources(
            cpu=str(instance.cpu or "1"),
            gpu=str(instance.gpu) if instance.gpu else None,
            memory=str(instance.memory or "2") + "Gi",
            disk=str(instance.disk or "10") + "Gi",
        )

        enum_target = to_enum(SandboxTargetRegion, instance.target)

        return SandboxInfo(
            id=instance.id,
            image=instance.image,
            user=instance.user,
            env=instance.env or {},
            labels=instance.labels or {},
            public=instance.public,
            target=enum_target or instance.target,
            resources=resources,
            state=instance.state,
            error_reason=instance.error_reason,
            snapshot_state=instance.snapshot_state,
            snapshot_created_at=instance.snapshot_created_at,
            auto_stop_interval=instance.auto_stop_interval,
            created=instance.info.created or "",
            node_domain=provider_metadata.get("nodeDomain", ""),
            region=provider_metadata.get("region", ""),
            class_name=provider_metadata.get("class", ""),
            updated_at=provider_metadata.get("updatedAt", ""),
            last_snapshot=provider_metadata.get("lastSnapshot"),
            provider_metadata=instance.info.provider_metadata,
        )

    async def __get_root_dir(self) -> str:
        if not self._root_dir:
            self._root_dir = await self.get_user_root_dir()
        return self._root_dir
