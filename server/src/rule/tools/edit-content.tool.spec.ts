import { ContentStatus } from '@prisma/client';
import { createEditContentTool } from './edit-content.tool';

const auth = { userId: 'u1', role: 'CUSTOMER' } as const;
const ruleId = 'r1';

function contentRow(status: ContentStatus = ContentStatus.draft) {
  return {
    contentId: 'c1',
    pipelineRef: 'p1',
    workflowRef: 'w1',
    ruleRef: ruleId,
    status,
    outputs: { text: 'Original caption' },
    userEdits: {},
  };
}

describe('edit_content', () => {
  const workflowService = {
    getWorkflowByRuleId: jest.fn().mockResolvedValue({ workflow: { workflowId: 'w1', ruleRef: ruleId, status: 'ready' }, nodes: [], edges: [] }),
    getWorkflow: jest.fn().mockResolvedValue({ workflow: { workflowId: 'w1', ruleRef: ruleId, status: 'ready' }, nodes: [], edges: [] }),
  };
  const contents = {
    findPage: jest.fn(),
    findById: jest.fn(),
    findLatestByPipeline: jest.fn(),
  };
  const contentService = { saveContent: jest.fn().mockResolvedValue({}) };
  const make = () => createEditContentTool(ruleId, workflowService as never, contents as never, contentService as never, auth as never);

  beforeEach(() => {
    jest.clearAllMocks();
    const row = contentRow();
    contents.findPage.mockResolvedValue({ data: [{ ...row, updatedAt: '2026-01-01', createdAt: '2026-01-01' }], total: 1 });
    contents.findById.mockResolvedValue(row);
  });

  it('replaces the caption with user wording', async () => {
    const parsed = JSON.parse((await make().invoke({ text: 'New caption #sale' })) as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('content_edited');
    expect(contentService.saveContent).toHaveBeenCalledWith('c1', { userEdits: { text: 'New caption #sale' } }, auth);
  });

  it('appends to the existing caption', async () => {
    await make().invoke({ text: '#sale', mode: 'append' });
    expect(contentService.saveContent).toHaveBeenCalledWith('c1', { userEdits: { text: 'Original caption\n#sale' } }, auth);
  });

  it('rejects an empty patch and rejected content', async () => {
    expect(JSON.parse((await make().invoke({})) as string).code).toBe('empty_patch');
    const approved = contentRow(ContentStatus.rejected);
    contents.findPage.mockResolvedValue({ data: [{ ...approved, updatedAt: '2026-01-01', createdAt: '2026-01-01' }], total: 1 });
    contents.findById.mockResolvedValue(approved);
    const parsed = JSON.parse((await make().invoke({ text: 'x' })) as string);
    expect(parsed.ok).toBe(false);
    expect(contentService.saveContent).not.toHaveBeenCalled();
  });
});
