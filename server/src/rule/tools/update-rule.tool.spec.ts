import { createUpdateRuleTool } from './update-rule.tool';
import type { RuleService } from '../rule.service';
import type { TenancyAuth } from '../../auth/tenancy.types';

describe('createUpdateRuleTool', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  function makeRuleService() {
    return {
      patchRule: jest.fn().mockResolvedValue({}),
    } as unknown as RuleService;
  }

  it('patches only the fields the model passed', async () => {
    const ruleService = makeRuleService();
    const chatTool = createUpdateRuleTool('rule-1', ruleService, auth);

    const result = await chatTool.invoke({
      brand: { industry: 'Software development', brandTone: ['friendly'] },
    });

    expect(ruleService.patchRule).toHaveBeenCalledWith(
      'rule-1',
      { brand: { industry: 'Software development', brandTone: ['friendly'] } },
      auth,
    );
    expect(result).toBe('Brand profile updated.');
  });

  it('patches campaign, channels, and contentGuidelines', async () => {
    const ruleService = makeRuleService();
    const chatTool = createUpdateRuleTool('rule-1', ruleService, auth);

    const result = await chatTool.invoke({
      campaign: { goals: ['awareness'], keywords: ['AI'] },
      channels: [
        { channel: 'instagram', priority: 'high', contentStyle: 'visual-first' },
      ],
      contentGuidelines: { dos: ['short sentences'], donts: ['jargon'] },
    });

    expect(ruleService.patchRule).toHaveBeenCalledWith(
      'rule-1',
      {
        campaign: { goals: ['awareness'], keywords: ['AI'] },
        channels: [
          { channel: 'instagram', priority: 'high', contentStyle: 'visual-first' },
        ],
        contentGuidelines: { dos: ['short sentences'], donts: ['jargon'] },
      },
      auth,
    );
    expect(result).toBe('Brand profile updated.');
  });

  it('does nothing and says so when no fields are given', async () => {
    const ruleService = makeRuleService();
    const chatTool = createUpdateRuleTool('rule-1', ruleService, auth);

    const result = await chatTool.invoke({});

    expect(ruleService.patchRule).not.toHaveBeenCalled();
    expect(result).toBe('Nothing to update — no fields were given.');
  });
});
