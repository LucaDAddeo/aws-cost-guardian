/**
 * WebSocket $connect handler — authenticates and stores connection.
 * Validates JWT from query string parameter `token` and stores
 * the connection ID + userId in a DynamoDB connections table.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { validateToken } from '../shared/auth.js';

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Handles WebSocket $connect route.
 * 1. Extracts JWT from query string parameter `token`.
 * 2. Validates the token.
 * 3. Stores connection ID + userId in DynamoDB.
 * 4. Returns 200 on success, 401 on auth failure.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // 1. Extract token from query string
    const token = event.queryStringParameters?.token;

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Token query parameter is required' }),
      };
    }

    // 2. Validate the token
    const authContext = await validateToken(token);

    // 3. Validate environment
    if (!CONNECTIONS_TABLE) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'CONNECTIONS_TABLE not configured' }),
      };
    }

    // 4. Store connection record
    const connectionId = event.requestContext.connectionId;

    await docClient.send(
      new PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: {
          connectionId,
          userId: authContext.userId,
          email: authContext.email,
          connectedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24h TTL
        },
      })
    );

    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    // Auth failures return 401
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Authentication failed' }),
      };
    }

    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Connection failed' }),
    };
  }
}
