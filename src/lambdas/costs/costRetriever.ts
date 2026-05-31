/**
 * CostRetriever Lambda — retrieves cost data from AWS Cost Explorer.
 * Handles GET /costs and GET /costs/summary via API Gateway.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.4
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandInput,
  type Expression,
} from '@aws-sdk/client-cost-explorer';
import { extractTokenFromEvent, validateToken } from '../shared/auth.js';
import { ApiError, createErrorResponse } from '../shared/errors.js';
import { CostQuerySchema, validateAndParse } from '../shared/validation.js';
import type { CostBreakdown } from '../shared/types.js';

const ceClient = new CostExplorerClient({});

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Handles GET /costs and GET /costs/summary requests.
 * 1. Validates auth token.
 * 2. Parses and validates query parameters.
 * 3. Calls Cost Explorer GetCostAndUsage.
 * 4. Aggregates and returns CostBreakdown JSON.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // 1. Extract and validate auth token
    const token = extractTokenFromEvent(event);
    await validateToken(token);

    // 2. Parse query parameters with defaults
    const queryParams = event.queryStringParameters ?? {};
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const params = validateAndParse(CostQuerySchema, {
      startDate: queryParams.startDate ?? formatDate(thirtyDaysAgo),
      endDate: queryParams.endDate ?? formatDate(today),
      granularity: queryParams.granularity ?? 'MONTHLY',
      ...(queryParams.region && { region: queryParams.region }),
      ...(queryParams.service && { service: queryParams.service }),
    });

    // 3. Build Cost Explorer request
    const filters = buildFilters(params.region, params.service);

    const ceInput: GetCostAndUsageCommandInput = {
      TimePeriod: {
        Start: params.startDate,
        End: params.endDate,
      },
      Granularity: params.granularity,
      Metrics: ['UnblendedCost'],
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' },
        { Type: 'DIMENSION', Key: 'REGION' },
      ],
      ...(filters && { Filter: filters }),
    };

    const ceResponse = await ceClient.send(
      new GetCostAndUsageCommand(ceInput)
    );

    // 4. Aggregate results into CostBreakdown
    const costBreakdown = aggregateCosts(ceResponse.ResultsByTime ?? []);

    return {
      statusCode: 200,
      body: JSON.stringify(costBreakdown),
      headers: CORS_HEADERS,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.statusCode, error.message, error.details);
    }

    // Handle Cost Explorer access denied specifically
    if (isAccessDeniedError(error)) {
      return createErrorResponse(
        403,
        'Access denied to Cost Explorer. Ensure the IAM role has ce:GetCostAndUsage permission and Cost Explorer is enabled in your account.'
      );
    }

    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, `Cost retrieval failed: ${message}`);
  }
}

/**
 * Builds Cost Explorer filter from optional region and service params.
 */
function buildFilters(
  region?: string,
  service?: string
): Expression | undefined {
  const expressions: Expression[] = [];

  if (region) {
    expressions.push({
      Dimensions: { Key: 'REGION', Values: [region] },
    });
  }
  if (service) {
    expressions.push({
      Dimensions: { Key: 'SERVICE', Values: [service] },
    });
  }

  if (expressions.length === 0) return undefined;

  if (expressions.length === 1) {
    return expressions[0];
  }

  return { And: expressions };
}

/**
 * Aggregates Cost Explorer results into a CostBreakdown.
 */
function aggregateCosts(
  resultsByTime: Array<{
    Groups?: Array<{
      Keys?: string[];
      Metrics?: Record<string, { Amount?: string; Unit?: string }>;
    }>;
  }>
): CostBreakdown {
  let totalCostUsd = 0;
  const byRegion: Record<string, number> = {};
  const byService: Record<string, number> = {};
  const byResourceMap: Map<string, { costUsd: number; service: string; region: string }> = new Map();

  for (const timePeriod of resultsByTime) {
    for (const group of timePeriod.Groups ?? []) {
      const keys = group.Keys ?? [];
      const service = keys[0] ?? 'Unknown';
      const region = keys[1] ?? 'Unknown';
      const amount = parseFloat(
        group.Metrics?.UnblendedCost?.Amount ?? '0'
      );

      totalCostUsd += amount;
      byService[service] = (byService[service] ?? 0) + amount;
      byRegion[region] = (byRegion[region] ?? 0) + amount;

      // Track per service+region combination for byResource
      const resourceKey = `${service}#${region}`;
      const existing = byResourceMap.get(resourceKey);
      if (existing) {
        existing.costUsd += amount;
      } else {
        byResourceMap.set(resourceKey, { costUsd: amount, service, region });
      }
    }
  }

  // Build byResource sorted by cost descending
  const byResource = Array.from(byResourceMap.values())
    .map((entry) => ({
      resourceId: entry.service,
      resourceType: 'lambda-function' as const, // Service-level grouping
      region: entry.region,
      costUsd: Math.round(entry.costUsd * 100) / 100,
      percentage: totalCostUsd > 0
        ? Math.round((entry.costUsd / totalCostUsd) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  // Calculate month-over-month change (simplified: compare first and last period)
  const monthOverMonthChange = calculateMoMChange(resultsByTime);

  return {
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    monthOverMonthChange,
    byRegion: roundValues(byRegion),
    byService: roundValues(byService),
    byResource,
  };
}

/**
 * Calculates month-over-month percentage change from time periods.
 */
function calculateMoMChange(
  resultsByTime: Array<{
    Groups?: Array<{
      Metrics?: Record<string, { Amount?: string }>;
    }>;
  }>
): number {
  if (resultsByTime.length < 2) return 0;

  const periodTotals = resultsByTime.map((period) => {
    let total = 0;
    for (const group of period.Groups ?? []) {
      total += parseFloat(group.Metrics?.UnblendedCost?.Amount ?? '0');
    }
    return total;
  });

  const previousPeriod = periodTotals[periodTotals.length - 2] ?? 0;
  const currentPeriod = periodTotals[periodTotals.length - 1] ?? 0;

  if (previousPeriod === 0) return 0;

  return Math.round(((currentPeriod - previousPeriod) / previousPeriod) * 10000) / 100;
}

/**
 * Rounds all values in a record to 2 decimal places.
 */
function roundValues(record: Record<string, number>): Record<string, number> {
  const rounded: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    rounded[key] = Math.round(value * 100) / 100;
  }
  return rounded;
}

/**
 * Formats a Date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Checks if an error is an AWS access denied error.
 */
function isAccessDeniedError(error: unknown): boolean {
  if (error instanceof Error) {
    const name = (error as { name?: string }).name ?? '';
    return (
      name === 'AccessDeniedException' ||
      name === 'UnauthorizedException' ||
      error.message.includes('Access Denied') ||
      error.message.includes('not authorized')
    );
  }
  return false;
}
