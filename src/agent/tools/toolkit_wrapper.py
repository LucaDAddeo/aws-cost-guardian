"""
Toolkit wrapper utility for invoking cloud-ops-toolkit scripts via subprocess.
Provides structured error handling and JSON response parsing.
"""

import json
import subprocess
from typing import Optional


class ToolkitError(Exception):
    """Raised when a toolkit script returns a non-zero exit code."""

    def __init__(self, exit_code: int, stderr: str):
        self.exit_code = exit_code
        self.stderr = stderr
        super().__init__(f"Toolkit error (code {exit_code}): {stderr}")


EXIT_CODE_MESSAGES: dict[int, str] = {
    0: "success",
    1: "Input error: {stderr}",
    2: "AWS API error: {stderr}",
    3: "Missing dependency: {stderr}",
}


def invoke_toolkit(
    script_path: str,
    profile: str,
    region: str,
    extra_args: Optional[dict] = None,
) -> dict:
    """Invoke a cloud-ops-toolkit script via subprocess with --json mode.

    Args:
        script_path: Relative path to the toolkit script.
        profile: AWS CLI profile name (never hardcoded credentials).
        region: AWS region identifier (e.g., us-east-1).
        extra_args: Additional script-specific arguments as key-value pairs.

    Returns:
        Parsed JSON response from stdout on success.

    Raises:
        ToolkitError: If the script returns a non-zero exit code.
        json.JSONDecodeError: If stdout is not valid JSON on success.
        subprocess.TimeoutExpired: If the script exceeds 120 seconds.
    """
    cmd = [
        script_path,
        "--profile",
        profile,
        "--region",
        region,
        "--json",
    ]

    if extra_args:
        for key, value in extra_args.items():
            cmd.extend([f"--{key.replace('_', '-')}", str(value)])

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode == 0:
        return json.loads(result.stdout)
    else:
        raise ToolkitError(result.returncode, result.stderr.strip())


def format_toolkit_error(error: ToolkitError) -> str:
    """Convert a ToolkitError into a user-friendly message.

    Args:
        error: The ToolkitError to format.

    Returns:
        A human-readable error message with the appropriate category.
    """
    template = EXIT_CODE_MESSAGES.get(
        error.exit_code,
        "Unknown error (code {exit_code}): {stderr}",
    )
    return template.format(
        exit_code=error.exit_code,
        stderr=error.stderr or "No details available",
    )
