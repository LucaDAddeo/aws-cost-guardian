/**
 * Unit tests for ScanInitiator Lambda.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK — the SFNClient is instantiated at module level,
// so we need the mock to capture the send function via the prototype.
const mockSend = vi.fn();

vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: vi.fn(() => ({ send: mockSend })),
  StartExecutionCommand: vi.fn((input) => input),
}));

// Mock auth module
vi.mock('../shared/auth.js', () => ({
  extractTokenFromEvent: vi.fn(() => 'mock-token'),
  validateToken: vi.fn(() =>
    Promise.resolve({
      userId: 'user-123',
      email: 'test@example.com',
      groups: [],
      tokenExpiry: Date.now() + 3600000,
    })
  ),
}));

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/scans',
    headers: { Authorization: 'Bearer valid-token' },
    body: null,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    ...overrides,
  };
}

describe('ScanInitiator Lambda', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
    // Set env before importing handler
    process.env.STATE_MACHINE_ARN = 'arn:aws:states:us-east-1:123456789012:stateMachine:ScanStateMachine';
  });

  it('should return 202 with scanId and status when successful', async () => {
    const { handler } = await import('./scanInitiator.js');
    const event = createEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body);
    expect(body.scanId).toBeDefined();
    expect(body.status).toBe('initiated');
    // Verify UUID format
    expect(body.scanId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('should call extractTokenFromEvent and validateToken', async () => {
    const { handler } = await import('./scanInitiator.js');
    const { extractTokenFromEvent, validateToken } = await import('../shared/auth.js');
    const event = createEvent();
    await handler(event);

    expect(extractTokenFromEvent).toHaveBeenCalledWith(event);
    expect(validateToken).toHaveBeenCalledWith('mock-token');
  });

  it('should start Step Functions execution with scanId', async () => {
    const { handler } = await import('./scanInitiator.js');
    const event = createEvent();
    await handler(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const commandArg = mockSend.mock.calls[0]![0];
    expect(commandArg.stateMachineArn).toBe(process.env.STATE_MACHINE_ARN);
    const input = JSON.parse(commandArg.input);
    expect(input.scanId).toBeDefined();
  });

  it('should return 401 when auth fails', async () => {
    const { validateToken } = await import('../shared/auth.js');
    const { ApiError } = await import('../shared/errors.js');
    vi.mocked(validateToken).mockRejectedValueOnce(
      new ApiError('Unauthorized: Token expired', 401)
    );

    const { handler } = await import('./scanInitiator.js');
    const event = createEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Unauthorized');
  });

  it('should return 500 when STATE_MACHINE_ARN is not set', async () => {
    delete process.env.STATE_MACHINE_ARN;

    // Need to re-import to pick up the env change — but since the module
    // reads STATE_MACHINE_ARN at the top level, we need to reset modules.
    vi.resetModules();

    // Re-apply mocks after module reset
    vi.doMock('@aws-sdk/client-sfn', () => ({
      SFNClient: vi.fn(() => ({ send: mockSend })),
      StartExecutionCommand: vi.fn((input) => input),
    }));
    vi.doMock('../shared/auth.js', () => ({
      extractTokenFromEvent: vi.fn(() => 'mock-token'),
      validateToken: vi.fn(() =>
        Promise.resolve({
          userId: 'user-123',
          email: 'test@example.com',
          groups: [],
          tokenExpiry: Date.now() + 3600000,
        })
      ),
    }));

    const { handler } = await import('./scanInitiator.js');
    const event = createEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('STATE_MACHINE_ARN');
  });

  it('should return 500 when Step Functions fails', async () => {
    // Reset modules to ensure STATE_MACHINE_ARN is picked up fresh
    process.env.STATE_MACHINE_ARN = 'arn:aws:states:us-east-1:123456789012:stateMachine:ScanStateMachine';
    vi.resetModules();

    // Re-apply mocks after module reset
    const localMockSend = vi.fn().mockRejectedValueOnce(new Error('SFN service unavailable'));
    vi.doMock('@aws-sdk/client-sfn', () => ({
      SFNClient: vi.fn(() => ({ send: localMockSend })),
      StartExecutionCommand: vi.fn((input) => input),
    }));
    vi.doMock('../shared/auth.js', () => ({
      extractTokenFromEvent: vi.fn(() => 'mock-token'),
      validateToken: vi.fn(() =>
        Promise.resolve({
          userId: 'user-123',
          email: 'test@example.com',
          groups: [],
          tokenExpiry: Date.now() + 3600000,
        })
      ),
    }));

    const { handler } = await import('./scanInitiator.js');
    const event = createEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Scan initiation failed');
  });

  it('should include CORS headers in response', async () => {
    const { handler } = await import('./scanInitiator.js');
    const event = createEvent();
    const result = await handler(event);

    expect(result.headers?.['Content-Type']).toBe('application/json');
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});
