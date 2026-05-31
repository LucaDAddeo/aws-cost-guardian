/**
 * Unit tests for RegionScanner Lambda.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all AWS SDK clients
const mockEC2Send = vi.fn();
const mockRDSSend = vi.fn();
const mockS3Send = vi.fn();
const mockLambdaSend = vi.fn();
const mockELBSend = vi.fn();
const mockECSSend = vi.fn();

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn(() => ({ send: mockEC2Send })),
  DescribeInstancesCommand: vi.fn((input) => ({ ...input, _type: 'DescribeInstances' })),
  DescribeVolumesCommand: vi.fn((input) => ({ ...input, _type: 'DescribeVolumes' })),
  DescribeNatGatewaysCommand: vi.fn((input) => ({ ...input, _type: 'DescribeNatGateways' })),
  DescribeAddressesCommand: vi.fn((input) => ({ ...input, _type: 'DescribeAddresses' })),
  DescribeImagesCommand: vi.fn((input) => ({ ...input, _type: 'DescribeImages' })),
  DescribeSnapshotsCommand: vi.fn((input) => ({ ...input, _type: 'DescribeSnapshots' })),
}));

vi.mock('@aws-sdk/client-rds', () => ({
  RDSClient: vi.fn(() => ({ send: mockRDSSend })),
  DescribeDBInstancesCommand: vi.fn((input) => input),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  ListBucketsCommand: vi.fn((input) => ({ ...input, _type: 'ListBuckets' })),
  GetBucketLocationCommand: vi.fn((input) => ({ ...input, _type: 'GetBucketLocation' })),
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({ send: mockLambdaSend })),
  ListFunctionsCommand: vi.fn((input) => input),
}));

vi.mock('@aws-sdk/client-elastic-load-balancing-v2', () => ({
  ElasticLoadBalancingV2Client: vi.fn(() => ({ send: mockELBSend })),
  DescribeLoadBalancersCommand: vi.fn((input) => input),
}));

vi.mock('@aws-sdk/client-ecs', () => ({
  ECSClient: vi.fn(() => ({ send: mockECSSend })),
  ListClustersCommand: vi.fn((input) => ({ ...input, _type: 'ListClusters' })),
  ListTasksCommand: vi.fn((input) => ({ ...input, _type: 'ListTasks' })),
}));

import { handler } from './regionScanner.js';

describe('RegionScanner Lambda', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: all calls return empty results
    mockEC2Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'DescribeInstances') return Promise.resolve({ Reservations: [] });
      if (cmd._type === 'DescribeVolumes') return Promise.resolve({ Volumes: [] });
      if (cmd._type === 'DescribeNatGateways') return Promise.resolve({ NatGateways: [] });
      if (cmd._type === 'DescribeAddresses') return Promise.resolve({ Addresses: [] });
      if (cmd._type === 'DescribeImages') return Promise.resolve({ Images: [] });
      if (cmd._type === 'DescribeSnapshots') return Promise.resolve({ Snapshots: [] });
      return Promise.resolve({});
    });
    mockRDSSend.mockResolvedValue({ DBInstances: [] });
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'ListBuckets') return Promise.resolve({ Buckets: [] });
      return Promise.resolve({ LocationConstraint: 'us-east-1' });
    });
    mockLambdaSend.mockResolvedValue({ Functions: [] });
    mockELBSend.mockResolvedValue({ LoadBalancers: [] });
    mockECSSend.mockImplementation((cmd: any) => {
      if (cmd._type === 'ListClusters') return Promise.resolve({ clusterArns: [] });
      return Promise.resolve({ taskArns: [] });
    });
  });

  it('should return success status when all scanners succeed with empty results', async () => {
    const result = await handler({ region: 'us-east-1', scanId: 'scan-123' });

    expect(result.region).toBe('us-east-1');
    expect(result.status).toBe('success');
    expect(result.resources).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.scannedAt).toBeDefined();
  });

  it('should correctly scan EC2 instances', async () => {
    mockEC2Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'DescribeInstances') {
        return Promise.resolve({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'i-12345',
                  InstanceType: 't3.micro',
                  State: { Name: 'running' },
                  LaunchTime: new Date('2024-01-01'),
                  VpcId: 'vpc-abc',
                  Tags: [{ Key: 'Name', Value: 'test-instance' }],
                },
              ],
            },
          ],
        });
      }
      if (cmd._type === 'DescribeVolumes') return Promise.resolve({ Volumes: [] });
      if (cmd._type === 'DescribeNatGateways') return Promise.resolve({ NatGateways: [] });
      if (cmd._type === 'DescribeAddresses') return Promise.resolve({ Addresses: [] });
      if (cmd._type === 'DescribeImages') return Promise.resolve({ Images: [] });
      if (cmd._type === 'DescribeSnapshots') return Promise.resolve({ Snapshots: [] });
      return Promise.resolve({});
    });

    const result = await handler({ region: 'us-east-1', scanId: 'scan-123' });

    const ec2Resources = result.resources.filter((r) => r.resourceType === 'ec2-instance');
    expect(ec2Resources).toHaveLength(1);
    expect(ec2Resources[0]!.resourceId).toBe('i-12345');
    expect(ec2Resources[0]!.status).toBe('running');
    expect(ec2Resources[0]!.metadata.instanceType).toBe('t3.micro');
    expect(ec2Resources[0]!.metadata.name).toBe('test-instance');
  });

  it('should return partial status when some scanners fail', async () => {
    // Make RDS fail
    mockRDSSend.mockRejectedValue(
      Object.assign(new Error('Access Denied'), { code: 'AccessDenied' })
    );

    const result = await handler({ region: 'eu-west-1', scanId: 'scan-456' });

    expect(result.status).toBe('partial');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.resourceType).toBe('rds-instance');
    expect(result.errors[0]!.errorCode).toBe('AccessDenied');
    expect(result.errors[0]!.message).toBe('Access Denied');
  });

  it('should continue scanning other resource types when one fails', async () => {
    // Make Lambda fail but EC2 succeed
    mockLambdaSend.mockRejectedValue(new Error('Lambda service error'));
    mockEC2Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'DescribeInstances') {
        return Promise.resolve({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'i-99999',
                  State: { Name: 'stopped' },
                  Tags: [],
                },
              ],
            },
          ],
        });
      }
      if (cmd._type === 'DescribeVolumes') return Promise.resolve({ Volumes: [] });
      if (cmd._type === 'DescribeNatGateways') return Promise.resolve({ NatGateways: [] });
      if (cmd._type === 'DescribeAddresses') return Promise.resolve({ Addresses: [] });
      if (cmd._type === 'DescribeImages') return Promise.resolve({ Images: [] });
      if (cmd._type === 'DescribeSnapshots') return Promise.resolve({ Snapshots: [] });
      return Promise.resolve({});
    });

    const result = await handler({ region: 'us-west-2', scanId: 'scan-789' });

    expect(result.status).toBe('partial');
    // EC2 instances should still be present
    const ec2Resources = result.resources.filter((r) => r.resourceType === 'ec2-instance');
    expect(ec2Resources).toHaveLength(1);
    // Lambda error should be recorded
    const lambdaErrors = result.errors.filter((e) => e.resourceType === 'lambda-function');
    expect(lambdaErrors).toHaveLength(1);
  });

  it('should filter S3 buckets by region', async () => {
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'ListBuckets') {
        return Promise.resolve({
          Buckets: [
            { Name: 'bucket-in-region', CreationDate: new Date('2024-01-01') },
            { Name: 'bucket-other-region', CreationDate: new Date('2024-02-01') },
          ],
        });
      }
      if (cmd._type === 'GetBucketLocation') {
        if (cmd.Bucket === 'bucket-in-region') {
          return Promise.resolve({ LocationConstraint: 'us-east-1' });
        }
        return Promise.resolve({ LocationConstraint: 'eu-west-1' });
      }
      return Promise.resolve({});
    });

    const result = await handler({ region: 'us-east-1', scanId: 'scan-s3' });

    const s3Resources = result.resources.filter((r) => r.resourceType === 's3-bucket');
    expect(s3Resources).toHaveLength(1);
    expect(s3Resources[0]!.resourceId).toBe('bucket-in-region');
  });

  it('should scan ECS tasks across clusters', async () => {
    mockECSSend.mockImplementation((cmd: any) => {
      if (cmd._type === 'ListClusters') {
        return Promise.resolve({
          clusterArns: ['arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster'],
        });
      }
      if (cmd._type === 'ListTasks') {
        return Promise.resolve({
          taskArns: ['arn:aws:ecs:us-east-1:123456789012:task/my-cluster/task-1'],
        });
      }
      return Promise.resolve({});
    });

    const result = await handler({ region: 'us-east-1', scanId: 'scan-ecs' });

    const ecsResources = result.resources.filter((r) => r.resourceType === 'ecs-task');
    expect(ecsResources).toHaveLength(1);
    expect(ecsResources[0]!.metadata.clusterArn).toContain('my-cluster');
  });

  it('should set correct region on all discovered resources', async () => {
    mockEC2Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'DescribeInstances') {
        return Promise.resolve({
          Reservations: [{ Instances: [{ InstanceId: 'i-1', State: { Name: 'running' } }] }],
        });
      }
      if (cmd._type === 'DescribeVolumes') {
        return Promise.resolve({
          Volumes: [{ VolumeId: 'vol-1', State: 'in-use', VolumeType: 'gp3' }],
        });
      }
      if (cmd._type === 'DescribeNatGateways') return Promise.resolve({ NatGateways: [] });
      if (cmd._type === 'DescribeAddresses') return Promise.resolve({ Addresses: [] });
      if (cmd._type === 'DescribeImages') return Promise.resolve({ Images: [] });
      if (cmd._type === 'DescribeSnapshots') return Promise.resolve({ Snapshots: [] });
      return Promise.resolve({});
    });

    const result = await handler({ region: 'ap-southeast-1', scanId: 'scan-region' });

    for (const resource of result.resources) {
      expect(resource.region).toBe('ap-southeast-1');
    }
  });

  it('should include scannedAt timestamp in ISO format', async () => {
    const result = await handler({ region: 'us-east-1', scanId: 'scan-time' });

    expect(result.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
