import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowQAAnswersDto } from '../../workflow/dto/workflow-qa-answers.dto';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool } from './tool-error.util';
import { guardWorkflowReplace, showWorkflowPayload } from './workflow-tool.util';

const GENERATE_WORKFLOW_SCHEMA = z.object({
  useWebSearch: z.boolean().default(false),
  useKeywordPlanner: z.boolean().default(false),
  generateSummary: z.boolean().default(false),
  summaryChannels: z.array(z.string()).default([]),
  generateImage: z.boolean().default(false),
  imageChannels: z.array(z.string()).default([]),
  generateVideo: z.boolean().default(false),
  videoChannels: z.array(z.string()).default([]),
  translate: z.boolean().default(false),
  translationChannels: z.array(z.string()).default([]),
  targetLanguages: z.array(z.string()).default([]),
  additionalMessage: z.string().default(''),
  confirmReplace: z
    .boolean()
    .default(false)
    .describe(
      'Must be true to replace a workflow that already exists. Ask the user first.',
    ),
});

type GenerateWorkflowArgs = z.infer<typeof GENERATE_WORKFLOW_SCHEMA>;

function answersFromArgs(args: GenerateWorkflowArgs): WorkflowQAAnswersDto {
  return {
    useWebSearch: args.useWebSearch ?? false,
    useKeywordPlanner: args.useKeywordPlanner ?? false,
    generateSummary: args.generateSummary ?? false,
    summaryChannels: args.summaryChannels ?? [],
    generateImage: args.generateImage ?? false,
    imageChannels: args.imageChannels ?? [],
    generateVideo: args.generateVideo ?? false,
    videoChannels: args.videoChannels ?? [],
    translate: args.translate ?? false,
    translationChannels: args.translationChannels ?? [],
    targetLanguages: args.targetLanguages ?? [],
    additionalMessage: args.additionalMessage ?? '',
  };
}

export function createGenerateWorkflowTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async (args: GenerateWorkflowArgs) =>
      runTool(async () => {
        const blocked = await guardWorkflowReplace(
          workflowService,
          ruleId,
          auth,
          args.confirmReplace ?? false,
        );
        if (blocked) return blocked;

        const created = await workflowService.regenerateWorkflowByRuleId(
          ruleId,
          { answers: answersFromArgs(args) },
          auth,
        );
        const snapshot = await workflowService.getWorkflow(created.workflowId, auth);
        return showWorkflowPayload({
          workflowId: created.workflowId,
          ruleId,
          status: String(snapshot.workflow.status || 'generating'),
          name: snapshot.workflow.name,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          brandName,
        });
      }),
    {
      name: 'generate_workflow',
      description:
        'Purpose: build a CUSTOM workflow for this brand from feature flags (keyword planner, web search, image, video, translation, summary); an AI pass fills the step configs and it costs workflow-generation credits. ' +
          'Use when: the user asks for specific features the default does not have (video, translation, summary, several image channels) or explicitly wants a custom workflow. ' +
          'Do NOT use: for a plain "set it up" / first workflow (use apply_default_workflow); to add, remove or reorder one step in an existing workflow (use add_workflow_node / remove_workflow_node / reorder_workflow_nodes); to change one step setting (use update_node_config); to make a post (use start_generation). ' +
          'Args: the feature flags; confirmReplace=true only after ask_user confirmed replacing an existing workflow. Image/video/translation channels must be on the brand profile (instagram, facebook, linkedin, tiktok). Does not run the pipeline. ' +
          'Errors: workflow_exists (ask before replacing), generation_in_progress (wait, do not call again), invalid_channels / no_channels (fix the brand channels first), insufficient_credits (tell the user to top up; do not retry).',
      schema: GENERATE_WORKFLOW_SCHEMA,
    },
  );
}
