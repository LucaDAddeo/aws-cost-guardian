/**
 * Shared error handling utilities for AWS Cost Guardian Lambda functions.
 */

/**
 * Custom API error with HTTP status code and optional details.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Standard error response shape returned by API Gateway.
 */
export interface ErrorResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

/**
 * Creates a standardized API Gateway error response.
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return {
    statusCode,
    body: JSON.stringify({
      error: message,
      ...(details && { details }),
    }),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  };
}
