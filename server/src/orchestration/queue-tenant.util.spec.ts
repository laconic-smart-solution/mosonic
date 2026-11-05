import {
  allQueueNamesForBase,
  tenantPipelineQueueName,
  tenantQueueBucket,
} from './queue-tenant.util';

describe('queue-tenant.util', () => {
  const prevIsolation = process.env.QUEUE_TENANT_ISOLATION;
  const prevBuckets = process.env.QUEUE_TENANT_BUCKETS;

  afterEach(() => {
    process.env.QUEUE_TENANT_ISOLATION = prevIsolation;
    process.env.QUEUE_TENANT_BUCKETS = prevBuckets;
  });

  it('returns base queue when isolation is off', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'false';
    expect(tenantPipelineQueueName('pipeline_nodes', 'user-a')).toBe(
      'pipeline_nodes',
    );
  });

  it('hashes userId into stable bucket', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'true';
    process.env.QUEUE_TENANT_BUCKETS = '64';
    const b1 = tenantQueueBucket('user-123');
    const b2 = tenantQueueBucket('user-123');
    expect(b1).toBe(b2);
    expect(b1).toMatch(/^b\d+$/);
    expect(tenantPipelineQueueName('pipeline_nodes', 'user-123')).toBe(
      `pipeline_nodes__${b1}`,
    );
  });

  it('allQueueNamesForBase returns just the base queue when isolation is off', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'false';
    expect(allQueueNamesForBase('pipeline_nodes')).toEqual(['pipeline_nodes']);
  });

  it('allQueueNamesForBase returns every bucket name when isolation is on', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'true';
    process.env.QUEUE_TENANT_BUCKETS = '4';
    expect(allQueueNamesForBase('pipeline_nodes')).toEqual([
      'pipeline_nodes__b0',
      'pipeline_nodes__b1',
      'pipeline_nodes__b2',
      'pipeline_nodes__b3',
    ]);
  });

  it('every user hashes into one of the registered bucket names', () => {
    process.env.QUEUE_TENANT_ISOLATION = 'true';
    process.env.QUEUE_TENANT_BUCKETS = '8';
    const names = allQueueNamesForBase('video_generate');
    for (const userId of ['user-a', 'user-b', 'user-c', 'user-d']) {
      expect(names).toContain(tenantPipelineQueueName('video_generate', userId));
    }
  });
});
