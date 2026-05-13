import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { mergeResolvedOutputs } from '../content/content-output.utils';
import {
  Content,
  ContentStatus,
  type ContentDocument,
} from '../content/schemas/content.schema';
import { EventsService } from '../events/events.service';
import {
  WorkflowNode,
  type WorkflowNodeDocument,
} from '../nodes/schemas/workflow-node.schema';
import type {
  NodeExecutorInput,
  PipelineContext,
} from '../nodes/types/node-execution.types';
import {
  Pipeline,
  PipelineNodeExecutionStatus,
  PipelineStatus,
  type PipelineDocument,
} from '../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import {
  Workflow,
  type WorkflowDocument,
} from '../workflow/schemas/workflow.schema';
import { UploadService } from '../upload/upload.service';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { NodeExecutor } from './node-executor.service';

@Injectable()
export class OrchestrationService {
  private readonly pausedPipelines = new Map<
    string,
    { resolve: () => void; nodeId: string }
  >();

  constructor(
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
    private readonly nodeExecutor: NodeExecutor,
    private readonly events: EventsService,
    private readonly uploadService: UploadService,
  ) {}

  async startPipeline(input: {
    workflowId: string;
    ruleId: string;
    contentPrompt: string;
    auth: TenancyAuth;
  }): Promise<{ pipelineId: string }> {
    const contentPrompt = input.contentPrompt.trim();
    if (!contentPrompt) {
      throw new BadRequestException('contentPrompt must not be empty');
    }

    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId: input.workflowId }, input.auth))
      .exec();
    if (!workflow) {
      throw new NotFoundException(`Workflow ${input.workflowId} not found`);
    }
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: input.ruleId }, input.auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${input.ruleId} not found`);
    }
    const nodes = await this.workflowNodeModel
      .find(
        mergeUserIdFilter({ workflowRef: workflow.workflowId }, input.auth),
      )
      .sort({ order: 1 })
      .exec();
    if (nodes.length === 0) {
      throw new BadRequestException('Workflow has no nodes to execute');
    }

    const pipeline = await this.pipelineModel.create({
      userId: input.auth.userId,
      workflowRef: workflow.workflowId,
      ruleRef: rule.ruleId,
      contentPrompt,
      nodes: nodes.map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt ?? '',
        config: (node.config ?? {}) as Record<string, unknown>,
        status: PipelineNodeExecutionStatus.Pending,
        input: '',
        output: null,
        retryCount: 0,
        executedAt: null,
      })),
      status: PipelineStatus.Running,
      startedAt: new Date(),
      completedAt: null,
    });

    const pipelineId = pipeline.pipelineId;
    void this.runPipelineAsync({
      pipelineId,
      workflowId: workflow.workflowId,
      ruleId: rule.ruleId,
      nodes,
      rule,
      contentPrompt,
      userId: input.auth.userId,
    }).catch(async (err: unknown) => {
      if (err instanceof PipelineBudgetExceededError) {
        return;
      }
      await this.updatePipelineStatus(pipelineId, PipelineStatus.Failed);
      this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
        pipelineId,
        message: 'An unexpected error occurred. Please try again.',
      });
    });
    return { pipelineId };
  }

  async retryNode(pipelineId: string, auth: TenancyAuth): Promise<void> {
    const owned = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .select({ pipelineId: 1 })
      .lean()
      .exec();
    if (!owned) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    const paused = this.pausedPipelines.get(pipelineId);
    if (!paused) {
      throw new BadRequestException('Pipeline is not paused');
    }
    this.pausedPipelines.delete(pipelineId);
    paused.resolve();
  }

  async getPipeline(
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<{
    pipeline: {
      pipelineId: string;
      workflowRef: string;
      ruleRef: string;
      contentPrompt: string;
      status: string;
      startedAt: Date;
      completedAt: Date | null;
    };
    nodes: Array<{
      nodeId: string;
      type: string;
      order: number;
      isLocked: boolean;
      userPrompt: string;
      config: Record<string, unknown>;
      status: string;
      output: Record<string, unknown> | null;
      retryCount: number;
      executedAt: Date | null;
    }>;
  }> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .lean()
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    return {
      pipeline: {
        pipelineId: pipeline.pipelineId,
        workflowRef: pipeline.workflowRef,
        ruleRef: pipeline.ruleRef,
        contentPrompt: pipeline.contentPrompt,
        status: pipeline.status,
        startedAt: pipeline.startedAt,
        completedAt: pipeline.completedAt,
      },
      nodes: (pipeline.nodes ?? []).map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt ?? '',
        config: node.config ?? {},
        status: node.status,
        output: parseNodeOutput(node.output),
        retryCount: node.retryCount,
        executedAt: node.executedAt,
      })),
    };
  }

  private async runPipelineAsync(args: {
    pipelineId: string;
    workflowId: string;
    ruleId: string;
    nodes: WorkflowNodeDocument[];
    rule: RuleDocument;
    contentPrompt: string;
    userId: string;
  }): Promise<void> {
    const { pipelineId, workflowId, ruleId, rule, contentPrompt, userId } = args;
    const orderedNodes = [...args.nodes].sort((a, b) => a.order - b.order);
    const totalNodes = orderedNodes.length;
    this.events.emitToPipeline(pipelineId, 'pipeline:started', {
      pipelineId,
      totalNodes,
    });

    const context: PipelineContext = {
      rule,
      contentPrompt,
      previousOutputs: {},
    };

    for (const node of orderedNodes) {
      await this.executeNodeWithPauseRetry({
        pipelineId,
        totalNodes,
        context,
        node,
        userId,
        ruleId: rule.ruleId,
      });
    }

    await this.updatePipelineStatus(
      pipelineId,
      PipelineStatus.Completed,
      new Date(),
    );
    const contentId = await this.createContent({
      pipelineId,
      workflowId,
      ruleId,
      context,
      userId,
    });

    const contentDoc = await this.contentModel.findOne({ contentId }).exec();
    if (!contentDoc) {
      throw new Error(`Content ${contentId} missing after pipeline completion`);
    }
    const resolvedOutputs = mergeResolvedOutputs({
      outputs: contentDoc.outputs ?? {},
      userEdits: contentDoc.userEdits ?? {},
    });
    const { uploadId } = await this.uploadService.createUpload({
      userId,
      contentRef: contentId,
      workflowRef: workflowId,
      ruleRef: ruleId,
      resolvedOutputs,
      ruleChannels: rule.channels ?? [],
    });

    this.events.emitToPipeline(pipelineId, 'pipeline:completed', {
      pipelineId,
      contentId,
      uploadId,
    });
  }

  private async executeNodeWithPauseRetry(args: {
    pipelineId: string;
    totalNodes: number;
    context: PipelineContext;
    node: WorkflowNodeDocument;
    userId: string;
    ruleId: string;
  }): Promise<void> {
    const { pipelineId, totalNodes, context, node, userId, ruleId } = args;

    for (;;) {
      await this.updateNodeStatus(
        pipelineId,
        node.nodeId,
        PipelineNodeExecutionStatus.Running,
      );

      const executorInput: NodeExecutorInput = {
        node: {
          nodeId: node.nodeId,
          type: node.type,
          order: node.order,
          config: node.config ?? {},
          workflowRef: node.workflowRef,
        },
        context,
        pipelineId,
        totalNodes,
        userId,
        ruleId,
      };

      try {
        const result = await this.nodeExecutor.execute(executorInput);
        await this.updateNodeStatus(
          pipelineId,
          node.nodeId,
          PipelineNodeExecutionStatus.Completed,
          result.output,
        );
        context.previousOutputs = {
          ...context.previousOutputs,
          ...result.output,
        };
        return;
      } catch (err) {
        if (err instanceof PipelineBudgetExceededError) {
          await this.updateNodeStatus(
            pipelineId,
            node.nodeId,
            PipelineNodeExecutionStatus.Failed,
          );
          await this.updatePipelineStatus(
            pipelineId,
            PipelineStatus.Failed,
            new Date(),
          );
          this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
            pipelineId,
            message: err.message,
            reason: 'budget',
            scope: err.scope,
          });
          throw err;
        }
        await this.updateNodeStatus(
          pipelineId,
          node.nodeId,
          PipelineNodeExecutionStatus.Failed,
        );
        await this.updatePipelineStatus(pipelineId, PipelineStatus.Paused);
        this.events.emitToPipeline(pipelineId, 'pipeline:paused', {
          pipelineId,
          nodeId: node.nodeId,
          nodeType: node.type,
        });

        await new Promise<void>((resolve) => {
          this.pausedPipelines.set(pipelineId, {
            resolve,
            nodeId: node.nodeId,
          });
        });
        await this.updatePipelineStatus(pipelineId, PipelineStatus.Running);
      }
    }
  }

  private async updatePipelineStatus(
    pipelineId: string,
    status: PipelineStatus,
    completedAt?: Date,
  ): Promise<void> {
    await this.pipelineModel
      .updateOne(
        { pipelineId },
        {
          $set: {
            status,
            ...(completedAt ? { completedAt } : {}),
          },
        },
      )
      .exec();
  }

  private async updateNodeStatus(
    pipelineId: string,
    nodeId: string,
    status: PipelineNodeExecutionStatus,
    output?: Record<string, unknown>,
  ): Promise<void> {
    await this.pipelineModel
      .updateOne(
        { pipelineId, 'nodes.nodeId': nodeId },
        {
          $set: {
            'nodes.$.status': status,
            ...(output ? { 'nodes.$.output': JSON.stringify(output) } : {}),
            'nodes.$.executedAt': new Date(),
          },
          ...(status === PipelineNodeExecutionStatus.Failed
            ? { $inc: { 'nodes.$.retryCount': 1 } }
            : {}),
        },
      )
      .exec();
  }

  private async createContent(args: {
    pipelineId: string;
    workflowId: string;
    ruleId: string;
    context: PipelineContext;
    userId: string;
  }): Promise<string> {
    const content = await this.contentModel.create({
      userId: args.userId,
      pipelineRef: args.pipelineId,
      workflowRef: args.workflowId,
      ruleRef: args.ruleId,
      outputs: {
        keywords: args.context.previousOutputs.keywords,
        text: args.context.previousOutputs.text,
        image: args.context.previousOutputs.image,
        translatedText: args.context.previousOutputs.translatedText,
        video: args.context.previousOutputs.video,
        transcription: args.context.previousOutputs.transcription,
        summary: args.context.previousOutputs.summary,
      },
      userEdits: {},
      nodePromptOverrides: {},
      status: ContentStatus.Draft,
    });
    return content.contentId;
  }
}

function parseNodeOutput(
  output: string | null,
): Record<string, unknown> | null {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : { output: String(parsed) };
  } catch {
    return { output };
  }
}
