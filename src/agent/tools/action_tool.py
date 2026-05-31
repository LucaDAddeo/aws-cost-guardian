"""
Resource action tool for the AWS Cost Guardian agent.
Executes resource operations with approval workflow for destructive actions.
"""

from strands import tool

from ..approval.workflow import create_approval_request, is_destructive
from .toolkit_wrapper import ToolkitError, format_toolkit_error, invoke_toolkit


@tool
def execute_resource_action(
    profile: str,
    region: str,
    resource_id: str,
    action: str,
    user_id: str = "",
) -> dict:
    """Execute an action on an AWS resource.

    For destructive operations (terminate, stop, delete), the approval
    workflow is triggered and the action will only proceed if approved.

    Args:
        profile: AWS CLI profile name.
        region: AWS region where the resource resides.
        resource_id: The identifier of the target resource.
        action: The operation to perform (e.g., stop_instance, terminate_instance).
        user_id: The authenticated user requesting the action.

    Returns:
        Dictionary with action outcome or approval request status.
    """
    # Check if the operation requires approval
    if is_destructive(action):
        # Determine resource type from action name
        resource_type = _infer_resource_type(action)
        impact = f"This will {action.replace('_', ' ')} resource {resource_id} in {region}."

        approval = create_approval_request(
            operation=action,
            target_resource_id=resource_id,
            target_resource_type=resource_type,
            impact=impact,
            user_id=user_id,
        )

        return {
            "status": "pending_approval",
            "approval_id": approval.approval_id,
            "operation": action,
            "target_resource_id": resource_id,
            "message": (
                f"Destructive operation '{action}' requires approval. "
                f"Approval request {approval.approval_id} has been sent."
            ),
        }

    # Non-destructive operations execute immediately
    try:
        return invoke_toolkit(
            "./cloud-ops-toolkit/scripts/actions/resource-action.sh",
            profile=profile,
            region=region,
            extra_args={
                "resource-id": resource_id,
                "action": action,
            },
        )
    except ToolkitError as e:
        return {"status": "error", "message": format_toolkit_error(e)}


def _infer_resource_type(action: str) -> str:
    """Infer the resource type from the action name."""
    action_to_type = {
        "terminate_instance": "ec2-instance",
        "stop_instance": "ec2-instance",
        "delete_volume": "ebs-volume",
        "delete_snapshot": "snapshot",
        "delete_ami": "ami",
        "stop_rds": "rds-instance",
        "delete_s3_objects": "s3-bucket",
        "delete_load_balancer": "load-balancer",
        "release_elastic_ip": "elastic-ip",
        "stop_ecs_task": "ecs-task",
    }
    return action_to_type.get(action, "unknown")
