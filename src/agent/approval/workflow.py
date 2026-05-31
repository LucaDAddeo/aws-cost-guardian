"""
Approval workflow module for the AWS Cost Guardian agent.
Enforces explicit user confirmation before any destructive operation executes.
"""

import time
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ApprovalDecision(Enum):
    """Possible outcomes of an approval request."""

    APPROVED = "approved"
    REJECTED = "rejected"
    TIMED_OUT = "timed_out"


@dataclass
class ApprovalRecord:
    """Record of an approval request and its outcome."""

    approval_id: str
    operation: str
    target_resource_id: str
    target_resource_type: str
    impact_description: str
    user_id: str
    decision: Optional[ApprovalDecision]
    requested_at: str  # ISO 8601
    decided_at: Optional[str]  # ISO 8601


# Operations that require explicit user approval before execution.
DESTRUCTIVE_OPERATIONS: set[str] = {
    "terminate_instance",
    "stop_instance",
    "delete_volume",
    "delete_snapshot",
    "delete_ami",
    "stop_rds",
    "delete_s3_objects",
    "delete_load_balancer",
    "release_elastic_ip",
    "stop_ecs_task",
}

# Approval requests expire after 5 minutes (300 seconds).
APPROVAL_TIMEOUT_SECONDS: int = 300


def is_destructive(operation: str) -> bool:
    """Determine if an operation requires approval before execution.

    Args:
        operation: The operation identifier (e.g., 'terminate_instance').

    Returns:
        True if the operation is classified as destructive.
    """
    return operation in DESTRUCTIVE_OPERATIONS


def create_approval_request(
    operation: str,
    target_resource_id: str,
    target_resource_type: str,
    impact: str,
    user_id: str,
) -> ApprovalRecord:
    """Create an approval request for a destructive operation.

    Generates a unique approval record with a timestamp. The record starts
    with no decision — it will be updated when the user responds or the
    timeout expires.

    Args:
        operation: The destructive operation to be performed.
        target_resource_id: Identifier of the target resource.
        target_resource_type: Type of the target resource (e.g., 'ec2-instance').
        impact: Human-readable description of the operation's impact.
        user_id: The authenticated user who will approve/reject.

    Returns:
        An ApprovalRecord with a unique ID and pending decision.
    """
    return ApprovalRecord(
        approval_id=str(uuid.uuid4()),
        operation=operation,
        target_resource_id=target_resource_id,
        target_resource_type=target_resource_type,
        impact_description=impact,
        user_id=user_id,
        decision=None,
        requested_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        decided_at=None,
    )
