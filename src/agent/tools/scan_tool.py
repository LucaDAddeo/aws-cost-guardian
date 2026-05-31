"""
Resource scan tool for the AWS Cost Guardian agent.
Triggers a multi-region resource scan via the cloud-ops-toolkit.
"""

from strands import tool

from .toolkit_wrapper import ToolkitError, format_toolkit_error, invoke_toolkit


@tool
def scan_resources(
    profile: str,
    region: str = "us-east-1",
) -> dict:
    """Scan AWS resources across all enabled regions.

    Invokes the cloud-ops-toolkit scan script to discover cost-generating
    resources including EC2, EBS, RDS, Lambda, S3, Load Balancers,
    NAT Gateways, Elastic IPs, ECS tasks, AMIs, and snapshots.

    Args:
        profile: AWS CLI profile name.
        region: Primary AWS region for the scan API call.

    Returns:
        Dictionary with discovered resources grouped by region and type.
    """
    try:
        return invoke_toolkit(
            "./cloud-ops-toolkit/scripts/inventory/resource-scan.sh",
            profile=profile,
            region=region,
        )
    except ToolkitError as e:
        return {"status": "error", "message": format_toolkit_error(e)}
