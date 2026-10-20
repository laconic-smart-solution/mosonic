import { getQueueToken } from '@nestjs/bullmq';
import { TenantQueueService } from './tenant-queue.service';

describe('TenantQueueService', () => {
  const prevIsolation = process.env.QUEUE_TENANT_ISOLATION;
  const prevBuckets = process.env.QUEUE_TENANT_BUCKETS;

  afterEach(() => {
    process.env.QUEUE_TENANT_ISOLATION = prevIsolation;
    process.env.QUEUE_TENANT_BUCKETS = prevBuckets;
  });

  it('forUser resolves the base queue by name when isolation is off', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'false';
    const queue = { name: 'pipeline_nodes' };
    const moduleRef = { get: jest.fn().mockReturnValue(queue) };
    const service = new TenantQueueService(moduleRef as never);

    const resolved = service.forUser('pipeline_nodes', 'user-1');

    expect(resolved).toBe(queue);
    expect(moduleRef.get).toHaveBeenCalledWith(
      getQueueToken('pipeline_nodes'),
      { strict: false },
    );
  });

  it('forUser resolves the hashed bucket queue when isolation is on', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'true';
    process.env.QUEUE_TENANT_BUCKETS = '8';
    const queue = { name: 'bucketed' };
    const moduleRef = { get: jest.fn().mockReturnValue(queue) };
    const service = new TenantQueueService(moduleRef as never);

    service.forUser('pipeline_nodes', 'user-1');
    const [tokenArg] = moduleRef.get.mock.calls[0];

    expect(tokenArg).toMatch(getQueueToken('pipeline_nodes__b').slice(0, -1));
  });

  it('forUser throws a clear error when the queue is not registered', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'false';
    const moduleRef = { get: jest.fn().mockReturnValue(undefined) };
    const service = new TenantQueueService(moduleRef as never);

    expect(() => service.forUser('pipeline_nodes', 'user-1')).toThrow(
      /not registered/,
    );
  });

  it('all resolves one queue per bucket when isolation is on', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'true';
    process.env.QUEUE_TENANT_BUCKETS = '3';
    const moduleRef = {
      get: jest.fn((token: string) => ({ name: token })),
    };
    const service = new TenantQueueService(moduleRef as never);

    const queues = service.all('pipeline_nodes');

    expect(queues).toHaveLength(3);
    expect(moduleRef.get).toHaveBeenCalledTimes(3);
  });

  it('all resolves a single queue when isolation is off', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'false';
    const moduleRef = {
      get: jest.fn((token: string) => ({ name: token })),
    };
    const service = new TenantQueueService(moduleRef as never);

    const queues = service.all('pipeline_nodes');

    expect(queues).toHaveLength(1);
  });
});
