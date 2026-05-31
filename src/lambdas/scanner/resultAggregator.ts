/**
 * ResultAggregator Lambda — merges all region scan results into a single aggregated object.
 * Invoked by Step Functions after the Map state completes.
 *
 * Requirements: 2.3, 9.1, 9.4
 */

import type { RegionScanResult, ResourceType } from '../shared/types.js';

/**
 * Input from Step Functions (output of the Map state).
 */
interface AggregatorInput {
  scanId: string;
  regionResults: RegionScanResult[];
}

/**
 * Aggregated scan result with totals and breakdowns.
 */
export interface AggregatedScanResult {
  scanId: string;
  totalResources: number;
  resourcesByType: Record<string, number>;
  resourcesByRegion: Record<string, number>;
  errorsCount: number;
  regionResults: RegionScanResult[];
  aggregatedAt: string;
}

/**
 * Handler invoked by Step Functions after all regions have been scanned.
 * Merges region results and calculates totals.
 */
export async function handler(event: AggregatorInput): Promise<AggregatedScanResult> {
  const { scanId, regionResults } = event;

  const resourcesByType: Record<string, number> = {};
  const resourcesByRegion: Record<string, number> = {};
  let totalResources = 0;
  let errorsCount = 0;

  for (const regionResult of regionResults) {
    const regionResourceCount = regionResult.resources.length;
    totalResources += regionResourceCount;
    errorsCount += regionResult.errors.length;

    // Count resources per region
    resourcesByRegion[regionResult.region] =
      (resourcesByRegion[regionResult.region] ?? 0) + regionResourceCount;

    // Count resources per type
    for (const resource of regionResult.resources) {
      resourcesByType[resource.resourceType] =
        (resourcesByType[resource.resourceType] ?? 0) + 1;
    }
  }

  return {
    scanId,
    totalResources,
    resourcesByType,
    resourcesByRegion,
    errorsCount,
    regionResults,
    aggregatedAt: new Date().toISOString(),
  };
}
