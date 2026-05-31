/**
 * Frontend type definitions for AWS Cost Guardian.
 * These mirror the backend types in src/lambdas/shared/types.ts.
 */

/**
 * Supported AWS resource types that generate costs.
 */
export type ResourceType =
  | 'ec2-instance'
  | 'ebs-volume'
  | 'rds-instance'
  | 'lambda-function'
  | 's3-bucket'
  | 'load-balancer'
  | 'nat-gateway'
  | 'elastic-ip'
  | 'ecs-task'
  | 'ami'
  | 'snapshot';

/**
 * Represents a discovered AWS resource with cost and metadata.
 */
export interface AWSResource {
  resourceId: string;
  resourceType: ResourceType;
  region: string;
  status: string;
  monthlyCost: number;
  metadata: Record<string, string>;
  lastScanTimestamp: string;
}

/**
 * Aggregated cost breakdown with totals and groupings.
 */
export interface CostBreakdown {
  totalCostUsd: number;
  monthOverMonthChange: number;
  byRegion: Record<string, number>;
  byService: Record<string, number>;
  byResource: ResourceCost[];
}

/**
 * Cost attribution for a single resource.
 */
export interface ResourceCost {
  resourceId: string;
  resourceType: ResourceType;
  region: string;
  costUsd: number;
  percentage: number;
}

/**
 * Result of scanning a single AWS region.
 */
export interface RegionScanResult {
  region: string;
  status: 'success' | 'partial' | 'error';
  resources: AWSResource[];
  errors: ScanError[];
  scannedAt: string;
}

/**
 * Error encountered while scanning a specific resource type.
 */
export interface ScanError {
  resourceType: ResourceType;
  errorCode: string;
  message: string;
}
