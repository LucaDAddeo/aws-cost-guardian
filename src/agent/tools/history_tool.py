"""
Action history tool for the AWS Cost Guardian agent.
Retrieves past resource operations and their outcomes.
"""

from strands import tool

from .toolkit_wrapper import ToolkitError, format_toolkit_error, invoke_toolkit


@tool
def get_action_history(
    profile: str,
    region: str = "us-east-1",
) -> dict:
    """Retrieve the history of resource actions performed by the user.

    Returns past operations with their approval status, target resources,
    and outcomes (success/failure).

    Args:
        profile: AWS CLI profile name.
        region: AWS region for the history API call.

    Returns:
        Dictionary with list of past actions and their details.
    """
    try:
        return invoke_toolkit(
            "./cloud-ops-toolkit/scripts/history/action-history.sh",
            profile=profile,
            region=region,
        )
    except ToolkitError as e:
        return {"status": "error", "message": format_toolkit_error(e)}
