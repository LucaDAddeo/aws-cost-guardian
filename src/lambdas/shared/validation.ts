/**
 * Input validation utilities for AWS Cost Guardian.
 * Uses Zod schemas for structured validation and custom sanitization for injection prevention.
 */

import { z } from 'zod';
import { ApiError } from './errors.js';

/**
 * Schema for cost query parameters.
 * Validates date format, granularity, and optional region/service filters.
 */
export const CostQuerySchema = z.object({
  startDate: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'startDate must be in YYYY-MM-DD format'
  ),
  endDate: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'endDate must be in YYYY-MM-DD format'
  ),
  granularity: z.enum(['DAILY', 'MONTHLY']).default('MONTHLY'),
  region: z.string().regex(
    /^[a-z]{2}-[a-z]+-\d$/,
    'region must be a valid AWS region (e.g., us-east-1)'
  ).optional(),
  service: z.string().max(100, 'service must be at most 100 characters').optional(),
});

/**
 * Schema for agent natural language queries.
 * Validates message length and trims whitespace.
 */
export const AgentQuerySchema = z.object({
  message: z.string()
    .min(1, 'message must not be empty')
    .max(2000, 'message must be at most 2000 characters')
    .trim(),
});

/**
 * Schema for scan initiation requests.
 * No parameters needed — scan uses server-side configuration.
 */
export const ScanInitiateSchema = z.object({});

/**
 * Schema for approval response submissions.
 * Validates UUID format for approvalId and enum for decision.
 */
export const ApprovalResponseSchema = z.object({
  approvalId: z.string().uuid('approvalId must be a valid UUID'),
  decision: z.enum(['approved', 'rejected']),
});

/**
 * Patterns considered dangerous for injection attacks.
 */
const SCRIPT_TAG_PATTERN = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const SQL_INJECTION_PATTERNS = [
  /\bDROP\s+TABLE\b/gi,
  /\bDELETE\s+FROM\b/gi,
  /\bINSERT\s+INTO\b/gi,
  /\bUPDATE\s+\w+\s+SET\b/gi,
  /\bUNION\s+SELECT\b/gi,
  /\bOR\s+1\s*=\s*1\b/gi,
  /\bAND\s+1\s*=\s*1\b/gi,
  /--\s/g,
];
const SHELL_METACHARACTERS = /[;|`&$(){}[\]\\]/g;

/**
 * Sanitizes user input by stripping potential injection patterns.
 * Removes script tags, SQL keywords in suspicious context, and shell metacharacters.
 * Limits output to 2000 characters.
 *
 * @param input - Raw user input string
 * @returns Sanitized string safe for processing
 */
export function sanitizeInput(input: string): string {
  let sanitized = input;

  // Remove <script> tags and their content
  sanitized = sanitized.replace(SCRIPT_TAG_PATTERN, '');

  // Remove SQL injection patterns
  for (const pattern of SQL_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Remove shell metacharacters
  sanitized = sanitized.replace(SHELL_METACHARACTERS, '');

  // Limit length to 2000 characters
  sanitized = sanitized.slice(0, 2000);

  return sanitized.trim();
}

/**
 * Validates and parses data against a Zod schema.
 * Throws ApiError(400) with detailed validation errors on failure.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The unknown data to validate
 * @returns The parsed and typed data
 * @throws ApiError(400) with validation error details
 */
export function validateAndParse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    throw new ApiError('Validation failed', 400, { errors });
  }

  return result.data;
}
