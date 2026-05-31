/**
 * WebSocket $disconnect handler — removes connection record from DynamoDB.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Handles WebSocket $disconnect route.
 * Deletes the connection record from DynamoDB.
 * Always returns 200 (disconnect is best-effort).
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!CONNECTIONS_TABLE) {
      // Log but don't fail — disconnect should always succeed
      console.warn('CONNECTIONS_TABLE environment variable is not configured');
      return { statusCode: 200, body: 'Disconnected' };
    }

    const connectionId = event.requestContext.connectionId;

    await docClient.send(
      new DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
      })
    );

    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    // Always return 200 for disconnect — best effort cleanup
    console.error('Error during disconnect cleanup:', error);
    return { statusCode: 200, body: 'Disconnected' };
  }
}
