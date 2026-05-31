/**
 * Authentication and authorization utilities for AWS Cost Guardian.
 * Validates JWT tokens issued by Amazon Cognito and extracts user context.
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { ApiError } from './errors.js';

/**
 * Authenticated user context extracted from a valid JWT token.
 */
export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
  tokenExpiry: number;
}

/**
 * Creates a Cognito JWT verifier instance using environment variables.
 * USER_POOL_ID and CLIENT_ID must be set in the Lambda environment.
 */
function createVerifier() {
  const userPoolId = process.env.USER_POOL_ID;
  const clientId = process.env.CLIENT_ID;

  if (!userPoolId || !clientId) {
    throw new ApiError(
      'Authentication configuration missing',
      500,
      { detail: 'USER_POOL_ID and CLIENT_ID environment variables must be set' }
    );
  }

  return CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: 'access',
    clientId,
  });
}

/**
 * Validates a JWT token against Cognito JWKS.
 * Verifies signature, expiry, issuer, and audience claims.
 *
 * @param token - The raw JWT token string (without "Bearer " prefix)
 * @returns AuthContext with user identity information
 * @throws ApiError(401) if the token is invalid, expired, or malformed
 */
export async function validateToken(token: string): Promise<AuthContext> {
  if (!token || token.trim().length === 0) {
    throw new ApiError('Authentication token is required', 401);
  }

  try {
    const verifier = createVerifier();
    const payload = await verifier.verify(token);

    return {
      userId: payload.sub,
      email: (payload['email'] as string) ?? '',
      groups: (payload['cognito:groups'] as string[]) ?? [],
      tokenExpiry: payload.exp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token validation failed';
    throw new ApiError(`Unauthorized: ${message}`, 401);
  }
}

/**
 * Extracts the Bearer token from the Authorization header of an API Gateway event.
 *
 * @param event - The API Gateway proxy event
 * @returns The raw JWT token string
 * @throws ApiError(401) if the Authorization header is missing or malformed
 */
export function extractTokenFromEvent(event: APIGatewayProxyEvent): string {
  const authHeader = event.headers?.Authorization ?? event.headers?.authorization;

  if (!authHeader) {
    throw new ApiError('Authorization header is required', 401);
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    throw new ApiError(
      'Authorization header must be in format: Bearer <token>',
      401
    );
  }

  return parts[1];
}
