/**
 * HistoryRetriever Lambda — retrieves action history for the authenticated user.
 * Handles GET /history via API Gateway.
 *
 * Requirements: 9.2, 9.5
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { extractTokenFromEvent, validateToken } from '../shared/auth.js';
import { ApiError, createErrorResponse } from '../shared/errors.js';

const TABLE_NAME = process.env.ACTION_HISTORY_TABLE;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Action history item as stored in DynamoDB.
 */
interface ActionHistoryItem {
  userId: string;
  actionTimestamp: string;
  operationType: string;
  targetResourceId: string;
  targetResourceType: string;
  approvalDecision: string;
  outcome: string;
}

/**
 * Handles GET /history requests.
 * 1. Validates auth token and extracts userId.
 * 2. Queries ActionHistory table by userId (newest first).
 * 3. Returns list of actions with operation details.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // 1. Extract and validate auth token, get userId
    const token = extractTokenFromEvent(event);
    const authContext = await validateToken(token);

    // 2. Validate environment
    if (!TABLE_NAME) {
      throw new ApiError(
        'ACTION_HISTORY_TABLE environment variable is not configured',
        500
      );
    }

    // 3. Query ActionHistory table by userId, newest first
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': authContext.userId },
        ScanIndexForward: false, // newest first
      })
    );

    // 4. Map items to response format
    const actions = (result.Items ?? []).map((item) => ({
      operationType: item.operationType as string,
      targetResourceId: item.targetResourceId as string,
      targetResourceType: item.targetResourceType as string,
      approvalDecision: item.approvalDecision as string,
      outcome: item.outcome as string,
      timestamp: item.actionTimestamp as string,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ actions }),
      headers: CORS_HEADERS,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.statusCode, error.message, error.details);
    }

    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, `History retrieval failed: ${message}`);
  }
}
