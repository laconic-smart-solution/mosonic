import { REACT_CHAT_INSTRUCTIONS } from './react-chat-instructions';
import { CHAT_MUTATIONS_PER_TURN } from '../tools/tool-guards.util';
import { createAskUserTool } from '../tools/ask-user.tool';
import { createCancelPipelineTool } from '../tools/cancel-pipeline.tool';
import { createForgetAllTool } from '../tools/forget.tool';
import { createGenerateMoreAdaptTool, createGenerateMoreImageTool } from '../tools/generate-more.tools';
import { createGetContentTool } from '../tools/get-content.tool';
import { createPublishNowTool } from '../tools/upload.tools';
import { createRememberTool } from '../tools/remember.tool';
import { createRerunContentNodeTool } from '../tools/rerun-content-node.tool';
import { createSaveContentTool } from '../tools/save-content.tool';
import { createStartGenerationTool } from '../tools/start-generation.tool';
import { createUpdateNodeConfigTool } from '../tools/update-node-config.tool';
import { createUpdateRuleTool } from '../tools/update-rule.tool';
import { createSetWorkflowChannelsTool } from '../tools/workflow-edit.tools';

const dep = {} as never;

describe('REACT_CHAT_INSTRUCTIONS core prompt', () => {
  it('requires start_generation instead of drafting in chat, but supports Two-Phase Interaction for inquiries', () => {
    expect(REACT_CHAT_INSTRUCTIONS).toContain('MUST call start_generation');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('not a copywriter');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('Two-Phase Interaction');
  });

  it('uses private reasoning (no forced Thought line) and is plain ASCII', () => {
    expect(REACT_CHAT_INSTRUCTIONS).toContain('Think privately');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('Never write "Thought:" lines');
    expect(REACT_CHAT_INSTRUCTIONS).not.toContain('Thought: <one sentence');
    // No smart dashes that render as mojibake in some consoles/logs.
    expect(/[^\x00-\x7F]/.test(REACT_CHAT_INSTRUCTIONS)).toBe(false);
  });

  it('covers live state, workflow edit tools, language, channels and examples', () => {
    expect(REACT_CHAT_INSTRUCTIONS).toContain('## How you work');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('## Live state is the truth');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('reorder_workflow_nodes');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('set_workflow_channels');
    expect(REACT_CHAT_INSTRUCTIONS).toContain("user's LATEST message");
    expect(REACT_CHAT_INSTRUCTIONS).toContain("isn't supported");
    expect(REACT_CHAT_INSTRUCTIONS).toContain('one question at a time');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('start_post');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('## Examples');
  });

  it('covers cancel and placeholder URLs', () => {
    expect(REACT_CHAT_INSTRUCTIONS).toContain('cancel_pipeline');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('example.com');
  });

  it('video and captions blurbs: HeyGen look rules, config flow, transcription then subtitle', () => {
    expect(REACT_CHAT_INSTRUCTIONS).toContain('presenter look+voice');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('heygen_video none');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('get_node_config -> ask_user -> update_node_config -> confirm');
    expect(REACT_CHAT_INSTRUCTIONS).toContain('transcription then subtitle');
    expect(REACT_CHAT_INSTRUCTIONS).not.toMatch(/sora/i);
  });

  it('stays short (per-tool rules live in tool descriptions and guards)', () => {
    expect(REACT_CHAT_INSTRUCTIONS.length).toBeLessThan(8000);
    // Guard-enforced prose stays out of the prompt.
    expect(REACT_CHAT_INSTRUCTIONS).not.toContain('PLAN CONFIRM');
    expect(REACT_CHAT_INSTRUCTIONS).not.toContain('Already started that post');
  });

  it('states the same per-turn change limit the chat loop enforces', () => {
    expect(REACT_CHAT_INSTRUCTIONS).toContain(`up to ${CHAT_MUTATIONS_PER_TURN} change tools`);
    expect(REACT_CHAT_INSTRUCTIONS).not.toContain('generate_more_video');
  });
});

describe('rules moved into tool descriptions', () => {
  const describeOf = (t: { description: string }) => t.description;

  it('start_generation: same turn, no-topic and text-only guidance', () => {
    const d = describeOf(createStartGenerationTool('r', dep, dep, dep));
    expect(d).toContain('do not ask_user again');
    expect(d).toContain('Remove the image step, then make the post');
    expect(d).toContain('Started. You can follow along below.');
  });

  it('draft on another channel goes to generate_more_adapt, not the template', () => {
    expect(describeOf(createGenerateMoreAdaptTool(dep))).toContain('never use set_workflow_channels');
    expect(describeOf(createSetWorkflowChannelsTool('r', dep, dep))).toContain('use generate_more_adapt');
  });

  it('generate-more image: style first, no video tool', () => {
    const d = describeOf(createGenerateMoreImageTool(dep));
    expect(d).toContain('Use <style> for future posts too');
    expect(d).toContain('generate_cinematic_video');
  });

  it('re-run and save: real node ids, mode=edit, fromNodeId, rejected drafts', () => {
    const rerun = describeOf(createRerunContentNodeTool('r', dep, dep, dep, dep));
    expect(rerun).toContain('mode=edit');
    expect(rerun).toContain('Do not write the new caption');
    expect(rerun).toContain('fromNodeId');
    expect(rerun).toContain('new version of a rejected post');
    expect(describeOf(createUpdateNodeConfigTool('r', dep, dep, dep))).toContain('to edit a generated caption or image');
    expect(describeOf(createSaveContentTool('r', dep, dep, dep, dep))).toContain('Never use it to store an attached file');
    expect(describeOf(createGetContentTool('r', dep, dep, dep, dep))).toContain('when they ask to see the post');
  });

  it('memory, profile, publish and cancel rules', () => {
    expect(describeOf(createRememberTool('r', dep, dep))).toContain('replaceIds');
    expect(describeOf(createForgetAllTool('r', dep, dep))).toContain('ALL saved brand memory notes');
    const rule = describeOf(createUpdateRuleTool('r', dep, dep));
    expect(rule).toContain('also call set_workflow_channels in the same turn');
    expect(rule).toContain('never fill in tone, audience');
    expect(describeOf(createPublishNowTool('r', dep, dep, dep, dep, dep))).toContain('start_channel_oauth');
    expect(describeOf(createCancelPipelineTool('r', dep, dep, dep, dep))).toContain('Never say you cannot stop a run');
    expect(describeOf(createAskUserTool())).toContain('up to 4, recommended first');
  });
});
