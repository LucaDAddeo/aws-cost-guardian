/**
 * ResultPersister Lambda — writes aggregated scan results to DynamoDB.
 * Invoked by Step Functions after the AggregateResults step.
 *
 * Writes one item per region+resourceType to the ScanResults table,
 * plus a "latest" marker item for the LatestScanIndex GSI.
 *
 * Requirements: 2.3, 9.1, 9.4
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type { AggregatedScanResult } from './resultAggregator.js';
import type { AWSResource, ResourceType } from '../shared/types.js';

const TABLE_NAME = process.env.SCAN_RESULTS_TABLE;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/** TTL: 90 days from now in epoch seconds */
function getTTL(): number {
  const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;
  return Math.floor(Date.now() / 1000) + NINETY_DAYS_IN_SECONDS;
}

/**
 * Input from Step Functions (output of AggregateResults step).
 */
interface PersisterInput {
  scanId: string;
  totalResources: number;
  resourcesByType: Record<string, number>;
  resourcesByRegion: Record<string, number>;
  errorsCount: number;
  regionResults: AggregatedScanResult['regionResults'];
  aggregatedAt: string;
}

/**
 * Handler invoked by Step Functions to persist scan results.
 */
export async function handler(event: PersisterInput): Promise<{ status: string; itemsWritten: number }> {
  if (!TABLE_NAME) {
    throw new Error('SCAN_RESULTS_TABLE environment variable is not configured');
  }

  const { scanId, regionResults, aggregatedAt, totalResources, resourcesByType, resourcesByRegion, errorsCount } = event;
  const ttl = getTTL();
  let itemsWritten = 0;

  // Group resources by region+resourceType for individual items
  const groupedItems: Map<string, AWSResource[]> = new Map();

  for (const regionResult of regionResults) {
    for (const resource of regionResult.resources) {
      const key = `${regionResult.region}#${resource.resourceType}`;
      const existing = groupedItems.get(key) ?? [];
      existing.push(resource);
      groupedItems.set(key, existing);
    }
  }

  // Write items in batches of 25 (DynamoDB BatchWrite limit)
  const allItems = Array.from(groupedItems.entries()).map(([regionResourceType, resources]) => ({
    PutRequest: {
      Item: {
        scanId,
        regionResourceType,
        resources,
        scannedAt: aggregatedAt,
        status: 'success',
        ttl,
      },
    },
  }));

  // Process in batches of 25
  for (let i = 0; i < allItems.length; i += 25) {
    const batch = allItems.slice(i, i + 25);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch,
        },
      })
    );
    itemsWritten += batch.length;
  }

  // Write the "latest" marker item for the LatestScanIndex GSI
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        scanId,
        regionResourceType: 'SUMMARY',
        latest: 'latest', // GSI PK
        scannedAt: aggregatedAt, // GSI SK
        totalResources,
        resourcesByType,
        resourcesByRegion,
        errorsCount,
        ttl,
      },
    })
  );
  itemsWritten += 1;

  return { status: 'persisted', itemsWritten };
}
