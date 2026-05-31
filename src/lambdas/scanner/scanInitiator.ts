/**
 * ScanInitiator Lambda — triggers a multi-region resource scan via Step Functions.
 * Invoked by API Gateway POST /scans.
 *
 * Requirements: 2.1
 */

import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { extractTokenFromEvent, validateToken } from '../shared/auth.js';
import { ApiError, createErrorResponse } from '../shared/errors.js';

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

const sfnClient = new SFNClient({});

/**
 * Handles POST /scans requests.
 * 1. Validates the auth token from the Authorization header.
 * 2. Generates a UUID scan ID.
 * 3. Starts a Step Functions execution with the scan ID.
 * 4. Returns 202 Accepted with the scan ID and status.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // 1. Extract and validate auth token
    const token = extractTokenFromEvent(event);
    await validateToken(token);

    // 2. Generate a UUID scan ID
    const scanId = randomUUID();

    // 3. Validate environment configuration
    if (!STATE_MACHINE_ARN) {
      throw new ApiError(
        'STATE_MACHINE_ARN environment variable is not configured',
        500
      );
    }

    // 4. Start Step Functions execution
    const command = new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: `scan-${scanId}`,
      input: JSON.stringify({ scanId }),
    });

    await sfnClient.send(command);

    // 5. Return 202 Accepted
    return {
      statusCode: 202,
      body: JSON.stringify({ scanId, status: 'initiated' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.statusCode, error.message, error.details);
    }

    // SFN or unexpected errors
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, `Scan initiation failed: ${message}`);
  }
}
