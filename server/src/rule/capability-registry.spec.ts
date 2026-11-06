import {
  CAPABILITY_REGISTRY_VERSION,
  buildRegistrySummary,
  imageStepGap,
  resolveCapability,
} from './capability-registry';
import { parseRequest, preflightRequest } from './capability.util';

describe('capability registry', () => {
  const nodes = [
    { type: 'text_generation' },
    { type: 'adapt', lane: 'facebook' },
    { type: 'image_generation', lane: 'facebook' },
  ];

  it('is versioned', () => {
    expect(CAPABILITY_REGISTRY_VERSION).toBe(1);
  });

  it('marks start_run reachable without workflow', () => {
    const r = resolveCapability('start_run', {
      nodes: null,
      brandChannels: [],
      hasDraft: false,
      activeRun: false,
    });
    expect(r?.availability).toBe('reachable_after_prep');
  });

  it('marks start_run executable with workflow', () => {
    const r = resolveCapability('start_run', {
      nodes,
      brandChannels: ['facebook'],
      hasDraft: false,
      activeRun: false,
    });
    expect(r?.availability).toBe('executable_now');
  });

  it('imageStepGap reflects multi-image need (Phase 1)', () => {
    expect(imageStepGap(nodes, 'facebook', 4)).toEqual({
      have: 1,
      need: 4,
      shortfall: 3,
    });
  });

  it('registry multi-image story matches preflight willChange', () => {
    const gap = imageStepGap(nodes, 'facebook', 4);
    const plan = preflightRequest({
      request: parseRequest('Facebook post with 4 service images'),
      nodes,
      attachedImages: 0,
    });
    expect(gap.shortfall).toBeGreaterThan(0);
    expect(plan.willChange.some((w) => /4 image steps/i.test(w))).toBe(true);
    expect(plan.notPossible.join(' ')).not.toMatch(/images per channel in one run/i);
  });

  it('buildRegistrySummary mentions image steps', () => {
    const s = buildRegistrySummary({
      nodes,
      brandChannels: ['facebook'],
      hasDraft: false,
      activeRun: false,
    });
    expect(s).toMatch(/Capability registry v1/);
    expect(s).toMatch(/facebook=1/);
    expect(s).toMatch(/mediaUrls/);
  });
});
