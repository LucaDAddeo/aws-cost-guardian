"""
AWS Cost Guardian Agent built with Strands SDK and Amazon Bedrock.
Provides natural language interaction for AWS cost management.
"""

import os
from typing import Any

from strands import Agent
from strands.models import BedrockModel

from .prompts import GUARDIAN_SYSTEM_PROMPT
from .tools.action_tool import execute_resource_action
from .tools.cleanup_tool import resource_cleanup_report
from .tools.cost_tool import get_cost_analysis
from .tools.history_tool import get_action_history
from .tools.scan_tool import scan_resources


def create_guardian_agent() -> Agent:
    """Create and configure the Guardian Agent with Bedrock model and tools.

    The model ID is read from the MODEL_ID environment variable,
    defaulting to Claude Sonnet if not set.

    Returns:
        A configured Strands Agent instance with all tools registered.
    """
    model_id = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514")

    model = BedrockModel(model_id=model_id)

    agent = Agent(
        model=model,
        system_prompt=GUARDIAN_SYSTEM_PROMPT,
        tools=[
            scan_resources,
            get_cost_analysis,
            resource_cleanup_report,
            execute_resource_action,
            get_action_history,
        ],
    )

    return agent


def process_query(message: str, user_id: str) -> dict[str, Any]:
    """Process a natural language query through the Guardian Agent.

    Args:
        message: The user's natural language query.
        user_id: The authenticated user's identifier.

    Returns:
        A structured response with 'status' and 'message' fields.
    """
    try:
        agent = create_guardian_agent()
        response = agent(message)

        return {
            "status": "success",
            "message": str(response),
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Agent processing failed: {str(e)}",
        }
