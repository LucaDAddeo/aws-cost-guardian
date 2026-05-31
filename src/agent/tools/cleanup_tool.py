"""
Resource cleanup report tool for the AWS Cost Guardian agent.
Identifies unused AWS resources that are candidates for cleanup.
"""

from strands import tool

from .toolkit_wrapper import ToolkitError, format_toolkit_error, invoke_toolkit


@tool
def resource_cleanup_report(
    profile: str,
    region: str = "us-east-1",
    days_threshold: int = 30,
) -> dict:
    """Identify unused AWS resources (stopped instances, unattached volumes, etc).

    Args:
        profile: AWS CLI profile name.
        region: AWS region to scan for unused resources.
        days_threshold: Number of days a resource must be idle to be flagged.

    Returns:
        Dictionary with lists of unused resources by category.
    """
    try:
        return invoke_toolkit(
            "./cloud-ops-toolkit/scripts/cleanup/resource-cleanup.sh",
            profile=profile,
            region=region,
            extra_args={"days": str(days_threshold)},
        )
    except ToolkitError as e:
        return {"status": "error", "message": format_toolkit_error(e)}
