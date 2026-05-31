/**
 * ScanResults Lambda — retrieves scan results from DynamoDB.
 * Handles GET /scans/latest and GET /scans/{scanId} via API Gateway.
 *
 * Requirements: 9.3
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { extractTokenFromEvent, validateToken } from '../shared/auth.js';
import { ApiError, createErrorResponse } from '../shared/errors.js';

const TABLE_NAME = process.env.SCAN_RESULTS_TABLE;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Handles GET /scans/latest and GET /scans/{scanId} requests.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // 1. Extract and validate auth token
    const token = extractTokenFromEvent(event);
    await validateToken(token);

    // 2. Validate environment
    if (!TABLE_NAME) {
      throw new ApiError(
        'SCAN_RESULTS_TABLE environment variable is not configured',
        500
      );
    }

    // 3. Determine which endpoint was called
    const path = event.path ?? event.resource ?? '';
    const scanId = event.pathParameters?.scanId;

    let results;

    if (path.endsWith('/latest') || path.includes('/scans/latest')) {
      // GET /scans/latest — query LatestScanIndex GSI
      results = await getLatestScan();
    } else if (scanId) {
      // GET /scans/{scanId} — query by PK
      results = await getScanById(scanId);
    } else {
      throw new ApiError('Invalid scan endpoint', 400);
    }

    if (!results || results.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No scan results found' }),
        headers: CORS_HEADERS,
      };
    }

    // 4. Build response with resource counts per region and type
    const response = buildScanResponse(results);

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: CORS_HEADERS,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.statusCode, error.message, error.details);
    }

    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, `Scan results retrieval failed: ${message}`);
  }
}

/**
 * Queries the LatestScanIndex GSI to get the most recent scan.
 */
async function getLatestScan(): Promise<Record<string, unknown>[]> {
  // First, get the latest scan summary from the GSI
  const summaryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'LatestScanIndex',
      KeyConditionExpression: '#latest = :latest',
      ExpressionAttributeNames: { '#latest': 'latest' },
      ExpressionAttributeValues: { ':latest': 'latest' },
      ScanIndexForward: false, // newest first
      Limit: 1,
    })
  );

  const latestItem = summaryResult.Items?.[0];
  if (!latestItem) return [];

  // Then get all items for that scanId
  const scanId = latestItem.scanId as string;
  return getScanById(scanId);
}

/**
 * Queries all items for a specific scanId.
 */
async function getScanById(scanId: string): Promise<Record<string, unknown>[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'scanId = :scanId',
      ExpressionAttributeValues: { ':scanId': scanId },
    })
  );

  return (result.Items ?? []) as Record<string, unknown>[];
}

/**
 * Builds a structured scan response from DynamoDB items.
 */
function buildScanResponse(items: Record<string, unknown>[]) {
  // Find the summary item
  const summaryItem = items.find(
    (item) => item.regionResourceType === 'SUMMARY'
  );

  // Get resource items (non-summary)
  const resourceItems = items.filter(
    (item) => item.regionResourceType !== 'SUMMARY'
  );

  // Calculate counts per region and type from resource items
  const resourcesByRegion: Record<string, number> = {};
  const resourcesByType: Record<string, number> = {};

  for (const item of resourceItems) {
    const regionResourceType = item.regionResourceType as string;
    const [region, resourceType] = regionResourceType.split('#');
    const resources = item.resources as unknown[];
    const count = resources?.length ?? 0;

    if (region) {
      resourcesByRegion[region] = (resourcesByRegion[region] ?? 0) + count;
    }
    if (resourceType) {
      resourcesByType[resourceType] = (resourcesByType[resourceType] ?? 0) + count;
    }
  }

  return {
    scanId: summaryItem?.scanId ?? resourceItems[0]?.scanId,
    scannedAt: summaryItem?.scannedAt ?? resourceItems[0]?.scannedAt,
    totalResources: summaryItem?.totalResources ?? Object.values(resourcesByRegion).reduce((a, b) => a + b, 0),
    resourcesByRegion: (summaryItem?.resourcesByRegion as Record<string, number>) ?? resourcesByRegion,
    resourcesByType: (summaryItem?.resourcesByType as Record<string, number>) ?? resourcesByType,
    errorsCount: summaryItem?.errorsCount ?? 0,
    items: resourceItems,
  };
}
