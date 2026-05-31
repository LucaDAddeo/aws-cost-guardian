"""
Cost analysis tool for the AWS Cost Guardian agent.
Retrieves AWS cost data grouped by service using the cloud-ops-toolkit.
"""

from strands import tool

from .toolkit_wrapper import ToolkitError, format_toolkit_error, invoke_toolkit


@tool
def get_cost_analysis(
    profile: str,
    region: str = "us-east-1",
    start_date: str = "",
    end_date: str = "",
    granularity: str = "MONTHLY",
) -> dict:
    """Retrieve AWS cost analysis data grouped by service.

    Args:
        profile: AWS CLI profile name.
        region: AWS region for Cost Explorer API call (default: us-east-1).
        start_date: Start date in YYYY-MM-DD format. Defaults to 30 days ago if empty.
        end_date: End date in YYYY-MM-DD format. Defaults to today if empty.
        granularity: Cost granularity — DAILY or MONTHLY.

    Returns:
        Dictionary with cost breakdown by service, region, and resource.
    """
    extra_args: dict = {"granularity": granularity}
    if start_date:
        extra_args["start-date"] = start_date
    if end_date:
        extra_args["end-date"] = end_date

    try:
        return invoke_toolkit(
            "./cloud-ops-toolkit/scripts/finops/cost-analysis.sh",
            profile=profile,
            region=region,
            extra_args=extra_args,
        )
    except ToolkitError as e:
        return {"status": "error", "message": format_toolkit_error(e)}
