import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import {
  VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE,
  VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
} from './billable-node-credit-types';
import {
  resolveCreditNodeTypeForPipelineNode,
  resolveVideoCreditNodeType,
} from './video-credit-node-type.util';

describe('video-credit-node-type.util', () => {
  describe('resolveVideoCreditNodeType', () => {
    it('maps presenter mode to presenter credit type', () => {
      expect(
        resolveVideoCreditNodeType({
          mode: 'presenter',
          heygenAvatarId: 'avatar-1',
        }),
      ).toBe(VIDEO_GENERATION_PRESENTER_CREDIT_TYPE);
    });

    it('maps cinematic mode to cinematic credit type', () => {
      expect(resolveVideoCreditNodeType({ mode: 'cinematic' })).toBe(
        VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE,
      );
    });

    it('defaults missing mode to cinematic credit type', () => {
      expect(resolveVideoCreditNodeType({})).toBe(
        VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE,
      );
    });
  });

  describe('resolveCreditNodeTypeForPipelineNode', () => {
    it('passes through non-video node types', () => {
      expect(
        resolveCreditNodeTypeForPipelineNode(
          WorkflowNodeType.TextGeneration,
          {},
        ),
      ).toBe(WorkflowNodeType.TextGeneration);
    });

    it('resolves video nodes by mode', () => {
      expect(
        resolveCreditNodeTypeForPipelineNode(
          WorkflowNodeType.VideoGeneration,
          { mode: 'presenter', heygenAvatarId: 'a1' },
        ),
      ).toBe(VIDEO_GENERATION_PRESENTER_CREDIT_TYPE);
    });
  });
});
