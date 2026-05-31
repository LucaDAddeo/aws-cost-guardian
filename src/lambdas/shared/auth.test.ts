import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTokenFromEvent } from './auth.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Unit tests for authentication utilities.
 * Note: validateToken() requires a real Cognito verifier and is tested
 * via property-based tests (Task 3.2) with mocked verifier behavior.
 */

function createMockEvent(headers: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    headers,
    body: null,
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/test',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    multiValueHeaders: {},
  };
}

describe('extractTokenFromEvent', () => {
  it('extracts token from valid Authorization header', () => {
    const event = createMockEvent({ Authorization: 'Bearer my-jwt-token-123' });
    const token = extractTokenFromEvent(event);
    expect(token).toBe('my-jwt-token-123');
  });

  it('extracts token from lowercase authorization header', () => {
    const event = createMockEvent({ authorization: 'Bearer lowercase-token' });
    const token = extractTokenFromEvent(event);
    expect(token).toBe('lowercase-token');
  });

  it('throws ApiError(401) when Authorization header is missing', () => {
    const event = createMockEvent({});
    expect(() => extractTokenFromEvent(event)).toThrow();
    try {
      extractTokenFromEvent(event);
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Authorization header is required');
    }
  });

  it('throws ApiError(401) when Authorization header has no Bearer prefix', () => {
    const event = createMockEvent({ Authorization: 'Basic some-token' });
    expect(() => extractTokenFromEvent(event)).toThrow();
    try {
      extractTokenFromEvent(event);
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Bearer');
    }
  });

  it('throws ApiError(401) when Authorization header has only Bearer without token', () => {
    const event = createMockEvent({ Authorization: 'Bearer' });
    expect(() => extractTokenFromEvent(event)).toThrow();
    try {
      extractTokenFromEvent(event);
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
    }
  });

  it('throws ApiError(401) when Authorization header has extra parts', () => {
    const event = createMockEvent({ Authorization: 'Bearer token extra-stuff' });
    expect(() => extractTokenFromEvent(event)).toThrow();
    try {
      extractTokenFromEvent(event);
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
    }
  });
});
