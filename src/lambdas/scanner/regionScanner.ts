/**
 * RegionScanner Lambda — scans a single AWS region for all cost-generating resource types.
 * Invoked by Step Functions Map state (not API Gateway).
 *
 * Uses Promise.allSettled so one resource type failure doesn't block others.
 * Returns RegionScanResult with status 'success' or 'partial'.
 *
 * Requirements: 2.2, 2.4
 */

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  DescribeNatGatewaysCommand,
  DescribeAddressesCommand,
  DescribeImagesCommand,
  DescribeSnapshotsCommand,
} from '@aws-sdk/client-ec2';
import {
  RDSClient,
  DescribeDBInstancesCommand,
} from '@aws-sdk/client-rds';
import {
  S3Client,
  ListBucketsCommand,
  GetBucketLocationCommand,
} from '@aws-sdk/client-s3';
import {
  LambdaClient,
  ListFunctionsCommand,
} from '@aws-sdk/client-lambda';
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  ECSClient,
  ListClustersCommand,
  ListTasksCommand,
} from '@aws-sdk/client-ecs';
import type {
  AWSResource,
  ResourceType,
  RegionScanResult,
  ScanError,
} from '../shared/types.js';

/**
 * Input event from Step Functions Map state.
 */
interface RegionScanInput {
  region: string;
  scanId: string;
}

/**
 * Handler invoked by Step Functions for each region.
 */
export async function handler(event: RegionScanInput): Promise<RegionScanResult> {
  const { region, scanId } = event;

  const ec2Client = new EC2Client({ region });
  const rdsClient = new RDSClient({ region });
  const s3Client = new S3Client({ region });
  const lambdaClient = new LambdaClient({ region });
  const elbClient = new ElasticLoadBalancingV2Client({ region });
  const ecsClient = new ECSClient({ region });

  // Run all scanners in parallel
  const results = await Promise.allSettled([
    scanEC2Instances(ec2Client, region),
    scanEBSVolumes(ec2Client, region),
    scanRDSInstances(rdsClient, region),
    scanLambdaFunctions(lambdaClient, region),
    scanS3Buckets(s3Client, region),
    scanLoadBalancers(elbClient, region),
    scanNatGateways(ec2Client, region),
    scanElasticIPs(ec2Client, region),
    scanECSTasks(ecsClient, region),
    scanAMIs(ec2Client, region),
    scanSnapshots(ec2Client, region),
  ]);

  const resourceTypes: ResourceType[] = [
    'ec2-instance',
    'ebs-volume',
    'rds-instance',
    'lambda-function',
    's3-bucket',
    'load-balancer',
    'nat-gateway',
    'elastic-ip',
    'ecs-task',
    'ami',
    'snapshot',
  ];

  const resources: AWSResource[] = [];
  const errors: ScanError[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const resourceType = resourceTypes[i]!;
    if (result.status === 'fulfilled') {
      resources.push(...result.value);
    } else {
      const error = result.reason as { code?: string; name?: string; message?: string } | undefined;
      errors.push({
        resourceType,
        errorCode: error?.code ?? error?.name ?? 'UNKNOWN',
        message: error?.message ?? 'Unknown error occurred',
      });
    }
  }

  return {
    region,
    status: errors.length === 0 ? 'success' : 'partial',
    resources,
    errors,
    scannedAt: new Date().toISOString(),
  };
}

// ─── Individual Resource Scanners ────────────────────────────────────────────

async function scanEC2Instances(
  client: EC2Client,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeInstancesCommand({});
  const response = await client.send(command);

  const resources: AWSResource[] = [];
  for (const reservation of response.Reservations ?? []) {
    for (const instance of reservation.Instances ?? []) {
      resources.push({
        resourceId: instance.InstanceId ?? 'unknown',
        resourceType: 'ec2-instance',
        region,
        status: instance.State?.Name ?? 'unknown',
        monthlyCost: 0, // Cost attribution handled separately via Cost Explorer
        metadata: {
          instanceType: instance.InstanceType ?? '',
          launchTime: instance.LaunchTime?.toISOString() ?? '',
          vpcId: instance.VpcId ?? '',
          name:
            instance.Tags?.find((t) => t.Key === 'Name')?.Value ?? '',
        },
        lastScanTimestamp: new Date().toISOString(),
      });
    }
  }
  return resources;
}

async function scanEBSVolumes(
  client: EC2Client,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeVolumesCommand({});
  const response = await client.send(command);

  return (response.Volumes ?? []).map((volume) => ({
    resourceId: volume.VolumeId ?? 'unknown',
    resourceType: 'ebs-volume' as ResourceType,
    region,
    status: volume.State ?? 'unknown',
    monthlyCost: 0,
    metadata: {
      size: String(volume.Size ?? 0),
      volumeType: volume.VolumeType ?? '',
      attachments: String(volume.Attachments?.length ?? 0),
      encrypted: String(volume.Encrypted ?? false),
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}

async function scanRDSInstances(
  client: RDSClient,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeDBInstancesCommand({});
  const response = await client.send(command);

  return (response.DBInstances ?? []).map((db) => ({
    resourceId: db.DBInstanceIdentifier ?? 'unknown',
    resourceType: 'rds-instance' as ResourceType,
    region,
    status: db.DBInstanceStatus ?? 'unknown',
    monthlyCost: 0,
    metadata: {
      engine: db.Engine ?? '',
      instanceClass: db.DBInstanceClass ?? '',
      multiAZ: String(db.MultiAZ ?? false),
      storageType: db.StorageType ?? '',
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}

async function scanLambdaFunctions(
  client: LambdaClient,
  region: string
): Promise<AWSResource[]> {
  const command = new ListFunctionsCommand({});
  const response = await client.send(command);

  return (response.Functions ?? []).map((fn) => ({
    resourceId: fn.FunctionName ?? 'unknown',
    resourceType: 'lambda-function' as ResourceType,
    region,
    status: fn.State ?? 'Active',
    monthlyCost: 0,
    metadata: {
      runtime: fn.Runtime ?? '',
      memorySize: String(fn.MemorySize ?? 0),
      timeout: String(fn.Timeout ?? 0),
      lastModified: fn.LastModified ?? '',
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}

async function scanS3Buckets(
  client: S3Client,
  region: string
): Promise<AWSResource[]> {
  const listCommand = new ListBucketsCommand({});
  const listResponse = await client.send(listCommand);

  const resources: AWSResource[] = [];

  for (const bucket of listResponse.Buckets ?? []) {
    if (!bucket.Name) continue;

    try {
      const locationCommand = new GetBucketLocationCommand({
        Bucket: bucket.Name,
      });
      const locationResponse = await client.send(locationCommand);

      // AWS returns null/empty for us-east-1, otherwise the region name
      const bucketRegion =
        locationResponse.LocationConstraint || 'us-east-1';

      if (bucketRegion === region) {
        resources.push({
          resourceId: bucket.Name,
          resourceType: 's3-bucket',
          region,
          status: 'active',
          monthlyCost: 0,
          metadata: {
            creationDate: bucket.CreationDate?.toISOString() ?? '',
          },
          lastScanTimestamp: new Date().toISOString(),
        });
      }
    } catch {
      // Skip buckets where we can't determine location (permission issues)
      continue;
    }
  }

  return resources;
}

async function scanLoadBalancers(
  client: ElasticLoadBalancingV2Client,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeLoadBalancersCommand({});
  const response = await client.send(command);

  return (response.LoadBalancers ?? []).map((lb) => ({
    resourceId: lb.LoadBalancerArn ?? 'unknown',
    resourceType: 'load-balancer' as ResourceType,
    region,
    status: lb.State?.Code ?? 'unknown',
    monthlyCost: 0,
    metadata: {
      name: lb.LoadBalancerName ?? '',
      type: lb.Type ?? '',
      scheme: lb.Scheme ?? '',
      vpcId: lb.VpcId ?? '',
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}

async function scanNatGateways(
  client: EC2Client,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeNatGatewaysCommand({});
  const response = await client.send(command);

  return (response.NatGateways ?? []).map((nat) => ({
    resourceId: nat.NatGatewayId ?? 'unknown',
    resourceType: 'nat-gateway' as ResourceType,
    region,
    status: nat.State ?? 'unknown',
    monthlyCost: 0,
    metadata: {
      subnetId: nat.SubnetId ?? '',
      vpcId: nat.VpcId ?? '',
      connectivityType: nat.ConnectivityType ?? '',
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}

async function scanElasticIPs(
  client: EC2Client,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeAddressesCommand({});
  const response = await client.send(command);

  return (response.Addresses ?? []).map((addr) => ({
    resourceId: addr.AllocationId ?? addr.PublicIp ?? 'unknown',
    resourceType: 'elastic-ip' as ResourceType,
    region,
    status: addr.AssociationId ? 'associated' : 'unassociated',
    monthlyCost: 0,
    metadata: {
      publicIp: addr.PublicIp ?? '',
      instanceId: addr.InstanceId ?? '',
      domain: addr.Domain ?? '',
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}

async function scanECSTasks(
  client: ECSClient,
  region: string
): Promise<AWSResource[]> {
  // First list all clusters
  const clustersCommand = new ListClustersCommand({});
  const clustersResponse = await client.send(clustersCommand);

  const resources: AWSResource[] = [];

  for (const clusterArn of clustersResponse.clusterArns ?? []) {
    const tasksCommand = new ListTasksCommand({ cluster: clusterArn });
    const tasksResponse = await client.send(tasksCommand);

    for (const taskArn of tasksResponse.taskArns ?? []) {
      resources.push({
        resourceId: taskArn,
        resourceType: 'ecs-task',
        region,
        status: 'running',
        monthlyCost: 0,
        metadata: {
          clusterArn: clusterArn,
        },
        lastScanTimestamp: new Date().toISOString(),
      });
    }
  }

  return resources;
}

async function scanAMIs(
  client: EC2Client,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeImagesCommand({
    Owners: ['self'],
  });
  const response = await client.send(command);

  return (response.Images ?? []).map((image) => ({
    resourceId: image.ImageId ?? 'unknown',
    resourceType: 'ami' as ResourceType,
    region,
    status: image.State ?? 'unknown',
    monthlyCost: 0,
    metadata: {
      name: image.Name ?? '',
      creationDate: image.CreationDate ?? '',
      architecture: image.Architecture ?? '',
      platform: image.PlatformDetails ?? '',
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}

async function scanSnapshots(
  client: EC2Client,
  region: string
): Promise<AWSResource[]> {
  const command = new DescribeSnapshotsCommand({
    OwnerIds: ['self'],
  });
  const response = await client.send(command);

  return (response.Snapshots ?? []).map((snap) => ({
    resourceId: snap.SnapshotId ?? 'unknown',
    resourceType: 'snapshot' as ResourceType,
    region,
    status: snap.State ?? 'unknown',
    monthlyCost: 0,
    metadata: {
      volumeId: snap.VolumeId ?? '',
      volumeSize: String(snap.VolumeSize ?? 0),
      startTime: snap.StartTime?.toISOString() ?? '',
      encrypted: String(snap.Encrypted ?? false),
    },
    lastScanTimestamp: new Date().toISOString(),
  }));
}
