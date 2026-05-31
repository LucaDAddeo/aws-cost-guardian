/**
 * WebSocket approval-response handler — processes user approval/rejection decisions.
 * Validates the approval response, updates the ApprovalLog table, and logs to ActionHistory.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { ApprovalResponseSchema, validateAndParse } from '../shared/validation.js';

const APPROVAL_LOG_TABLE = process.env.APPROVAL_LOG_TABLE;
const ACTION_HISTORY_TABLE = process.env.ACTION_HISTORY_TABLE;
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Handles WebSocket approval-response route.
 * 1. Parses and validates the approval response body.
 * 2. Looks up the connection to get userId.
 * 3. Updates the ApprovalLog table with the decision and timestamp.
 * 4. Logs the action to the ActionHistory table.
 * 5. Returns 200.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // 1. Parse and validate the body
    const body = event.body ? JSON.parse(event.body) : {};
    const { approvalId, decision } = validateAndParse(ApprovalResponseSchema, body);

    // 2. Get userId from connection record
    const connectionId = event.requestContext.connectionId;
    let userId = 'unknown';

    if (CONNECTIONS_TABLE && connectionId) {
      const connectionResult = await docClient.send(
        new GetCommand({
          TableName: CONNECTIONS_TABLE,
          Key: { connectionId },
        })
      );
      userId = (connectionResult.Item?.userId as string) ?? 'unknown';
    }

    const decidedAt = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days

    // 3. Update ApprovalLog table with decision and timestamp
    if (APPROVAL_LOG_TABLE) {
      await docClient.send(
        new UpdateCommand({
          TableName: APPROVAL_LOG_TABLE,
          Key: { approvalId },
          UpdateExpression: 'SET decision = :decision, decidedAt = :decidedAt, userId = :userId',
          ExpressionAttributeValues: {
            ':decision': decision,
            ':decidedAt': decidedAt,
            ':userId': userId,
          },
        })
      );
    }

    // 4. Log to ActionHistory table
    if (ACTION_HISTORY_TABLE) {
      // Retrieve the approval record to get operation details
      let operationType = 'unknown';
      let targetResourceId = 'unknown';
      let targetResourceType = 'unknown';

      if (APPROVAL_LOG_TABLE) {
        const approvalRecord = await docClient.send(
          new GetCommand({
            TableName: APPROVAL_LOG_TABLE,
            Key: { approvalId },
          })
        );

        if (approvalRecord.Item) {
          operationType = (approvalRecord.Item.operation as string) ?? 'unknown';
          targetResourceId = (approvalRecord.Item.targetResourceId as string) ?? 'unknown';
          targetResourceType = (approvalRecord.Item.targetResourceType as string) ?? 'unknown';
        }
      }

      await docClient.send(
        new PutCommand({
          TableName: ACTION_HISTORY_TABLE,
          Item: {
            userId,
            actionTimestamp: decidedAt,
            operationType,
            targetResourceId,
            targetResourceType,
            approvalDecision: decision,
            outcome: decision === 'approved' ? 'pending_execution' : 'cancelled',
            ttl,
          },
        })
      );
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'processed' }) };
  } catch (error) {
    console.error('Error processing approval response:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to process approval';
    return {
      statusCode: 400,
      body: JSON.stringify({ error: message }),
    };
  }
}
