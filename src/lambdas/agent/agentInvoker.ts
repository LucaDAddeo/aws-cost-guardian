/**
 * AgentInvoker Lambda — handles POST /agent/query requests.
 * Validates authentication, parses the query, invokes the Python Guardian Agent,
 * and returns the structured response.
 */

import { execSync } from 'child_process';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractTokenFromEvent, validateToken } from '../shared/auth.js';
import { createErrorResponse } from '../shared/errors.js';
import { AgentQuerySchema, sanitizeInput, validateAndParse } from '../shared/validation.js';

/**
 * Path to the Python agent entry point, relative to the Lambda deployment package.
 * In production this runs via a Lambda layer or container image.
 */
const AGENT_SCRIPT_PATH = process.env.AGENT_SCRIPT_PATH ?? '/opt/agent/run_agent.py';

interface AgentResponse {
  status: string;
  message: string;
}

/**
 * Invoke the Python Guardian Agent via subprocess.
 * Passes the sanitized message and userId as JSON on stdin.
 */
function invokeAgent(message: string, userId: string): AgentResponse {
  const input = JSON.stringify({ message, user_id: userId });

  try {
    const result = execSync(
      `python3 "${AGENT_SCRIPT_PATH}"`,
      {
        input,
        encoding: 'utf-8',
        timeout: 60_000, // 60 second timeout
        env: {
          ...process.env,
          PYTHONPATH: process.env.PYTHONPATH ?? '/opt/agent',
        },
      },
    );

    const parsed = JSON.parse(result.trim()) as AgentResponse;
    return parsed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown agent error';
    return {
      status: 'error',
      message: `Agent invocation failed: ${errorMessage}`,
    };
  }
}

/**
 * Lambda handler for POST /agent/query.
 *
 * Flow:
 * 1. Extract and validate JWT token from Authorization header
 * 2. Parse and validate request body against AgentQuerySchema
 * 3. Sanitize the user message
 * 4. Invoke the Python Guardian Agent
 * 5. Return the agent's structured response
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    // 1. Authenticate
    const token = extractTokenFromEvent(event);
    const authContext = await validateToken(token);

    // 2. Parse and validate body
    if (!event.body) {
      return createErrorResponse(400, 'Request body is required');
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { message } = validateAndParse(AgentQuerySchema, body);

    // 3. Sanitize input
    const sanitizedMessage = sanitizeInput(message);

    if (!sanitizedMessage) {
      return createErrorResponse(400, 'Message is empty after sanitization');
    }

    // 4. Invoke agent
    const agentResponse = invokeAgent(sanitizedMessage, authContext.userId);

    // 5. Return response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: agentResponse.status,
        message: agentResponse.message,
        userId: authContext.userId,
      }),
    };
  } catch (error: unknown) {
    // Handle known API errors (auth failures, validation errors)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string; details?: Record<string, unknown> };
      return createErrorResponse(
        apiError.statusCode,
        apiError.message,
        apiError.details,
      );
    }

    // Unexpected errors
    console.error('AgentInvoker unexpected error:', error);
    return createErrorResponse(500, 'Internal server error');
  }
}
