import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import {
  WorkflowNode,
  WorkflowNodeType,
  type WorkflowNodeDocument,
} from '../nodes/schemas/workflow-node.schema';
import { EventsService } from '../events/events.service';
import { RuleService } from '../rule/rule.service';
import {
  GenerateWorkflowRequestDto,
  GenerateWorkflowResponseDto,
  RegenerateWorkflowByRuleRequestDto,
  RegenerateWorkflowByRuleResponseDto,
} from './dto/generate-workflow.dto';
import {
  SaveWorkflowNodesRequestDto,
  SaveWorkflowNodesResponseDto,
} from './dto/save-workflow-nodes.dto';
import {
  Workflow,
  type WorkflowDocument,
  WorkflowStatus,
} from './schemas/workflow.schema';
import {
  type GeneratedWorkflowNode,
  WorkflowGenerationService,
} from './services/workflow-generation.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    private readonly workflowGeneration: WorkflowGenerationService,
    private readonly llm: LlmService,
    private readonly ruleService: RuleService,
    private readonly events: EventsService,
  ) {}

  async generateWorkflow(
    body: GenerateWorkflowRequestDto,
    auth: TenancyAuth,
  ): Promise<GenerateWorkflowResponseDto> {
    const prompt = body.contentPrompt.trim();
    if (!prompt) {
      throw new BadRequestException('contentPrompt must not be empty');
    }

    const ruleId = body.ruleId?.trim();
    if (ruleId) {
      return this.regenerateWorkflowByRuleId(ruleId, { contentPrompt: prompt }, auth);
    }

    const resolvedRuleId = await this.ruleService.extractAndAwaitReady(
      prompt,
      auth,
    );
    const workflow = await this.createWorkflow(
      resolvedRuleId,
      prompt,
      auth.userId,
    );

    void this.runGeneration(workflow.workflowId, prompt, resolvedRuleId, auth);
    return { workflowId: workflow.workflowId, ruleId: resolvedRuleId };
  }

  async regenerateWorkflowByRuleId(
    ruleId: string,
    body: RegenerateWorkflowByRuleRequestDto,
    auth: TenancyAuth,
  ): Promise<RegenerateWorkflowByRuleResponseDto> {
    const normalizedRuleId = ruleId.trim();
    if (!normalizedRuleId) {
      throw new BadRequestException('ruleId must not be empty');
    }
    const prompt = body.contentPrompt.trim();
    if (!prompt) {
      throw new BadRequestException('contentPrompt must not be empty');
    }

    await this.ruleService.getRuleById(normalizedRuleId, auth);

    const existing = await this.workflowModel
      .findOne(mergeUserIdFilter({ ruleRef: normalizedRuleId }, auth))
      .sort({ createdAt: -1 })
      .exec();
    const workflow =
      existing ??
      (await this.createWorkflow(normalizedRuleId, prompt, auth.userId));

    if (existing?.workflowId) {
      await this.workflowModel
        .updateOne(
          mergeUserIdFilter({ workflowId: existing.workflowId }, auth),
          {
            $set: {
              status: WorkflowStatus.Generating,
              name: `Workflow for: ${prompt.slice(0, 64)}`,
            },
          },
        )
        .exec();
    }

    void this.runGeneration(
      workflow.workflowId,
      prompt,
      normalizedRuleId,
      auth,
    );
    return { workflowId: workflow.workflowId, ruleId: normalizedRuleId };
  }

  async getWorkflow(
    workflowId: string,
    auth: TenancyAuth,
  ): Promise<{
    workflow: WorkflowDocument;
    nodes: WorkflowNodeDocument[];
  }> {
    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId }, auth))
      .exec();
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    const nodes = await this.workflowNodeModel
      .find(
        mergeUserIdFilter({ workflowRef: workflowId }, auth),
      )
      .sort({ order: 1 })
      .exec();
    return { workflow, nodes };
  }

  async getWorkflowByRuleId(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<{
    workflow: WorkflowDocument;
    nodes: WorkflowNodeDocument[];
  } | null> {
    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ ruleRef: ruleId }, auth))
      .sort({ createdAt: -1 })
      .exec();
    if (!workflow) return null;
    const nodes = await this.workflowNodeModel
      .find(
        mergeUserIdFilter({ workflowRef: workflow.workflowId }, auth),
      )
      .sort({ order: 1 })
      .exec();
    return { workflow, nodes };
  }

  async saveNodes(
    workflowId: string,
    body: SaveWorkflowNodesRequestDto,
    auth: TenancyAuth,
  ): Promise<SaveWorkflowNodesResponseDto> {
    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId }, auth))
      .exec();
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    const normalized = this.normalizeAndValidateNodes(body.nodes);
    const ownerUserId = workflow.userId ?? auth.userId;

    await this.workflowNodeModel
      .deleteMany(mergeUserIdFilter({ workflowRef: workflowId }, auth))
      .exec();
    const created = await this.workflowNodeModel.create(
      normalized.map((n) => ({
        workflowRef: workflowId,
        userId: ownerUserId,
        type: n.type,
        order: n.order,
        isLocked: n.isLocked,
        userPrompt: n.userPrompt,
        config: n.config,
      })),
    );
    const nodeIds = created.map((n) => n.nodeId);

    const nextVersion = (workflow.version ?? 1) + 1;
    await this.workflowModel
      .updateOne(
        mergeUserIdFilter({ workflowId }, auth),
        {
          $set: {
            nodes: nodeIds,
            version: nextVersion,
          },
          $push: {
            versions: {
              versionNumber: nextVersion,
              nodes: nodeIds,
              createdAt: new Date(),
            },
          },
        },
      )
      .exec();

    return { success: true };
  }

  private normalizeAndValidateNodes(
    nodes: SaveWorkflowNodesRequestDto['nodes'],
  ): Array<{
    type: WorkflowNodeType;
    order: number;
    isLocked: boolean;
    userPrompt?: string;
    config: Record<string, unknown>;
  }> {
    if (!nodes.length) {
      throw new BadRequestException('nodes must not be empty');
    }
    const sorted = [...nodes].sort((a, b) => a.order - b.order);
    const textNodes = sorted.filter(
      (n) => n.type === WorkflowNodeType.TextGeneration,
    );
    if (textNodes.length !== 1) {
      throw new BadRequestException(
        'Exactly one text_generation node is required',
      );
    }
    if (sorted[0]?.type !== WorkflowNodeType.TextGeneration) {
      throw new BadRequestException('text_generation node must be first');
    }
    const normalized = sorted.map((n, idx) => ({
      type: n.type,
      order: idx + 1,
      isLocked:
        n.type === WorkflowNodeType.TextGeneration ? true : Boolean(n.isLocked),
      userPrompt: n.userPrompt?.trim() || undefined,
      config: n.config ?? {},
    }));
    for (const node of normalized) {
      try {
        this.llm.validateWorkflowNodeConfig(node.type, node.config);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'invalid provider configuration';
        throw new BadRequestException(
          `Invalid config for node "${node.type}": ${message}`,
        );
      }
    }
    if (normalized[0].order !== 1 || !normalized[0].isLocked) {
      throw new BadRequestException(
        'text_generation node must be order=1 and locked',
      );
    }
    return normalized;
  }

  private async runGeneration(
    workflowId: string,
    contentPrompt: string,
    incomingRuleId: string | undefined,
    auth: TenancyAuth,
  ): Promise<void> {
    try {
      this.events.emitToWorkflow(workflowId, 'workflow:started', {
        workflowId,
      });

      const ruleId = incomingRuleId?.trim()
        ? incomingRuleId.trim()
        : await this.ruleService.extractAndAwaitReady(contentPrompt, auth);

      await this.workflowModel
        .updateOne(
          mergeUserIdFilter({ workflowId }, auth),
          { $set: { ruleRef: ruleId } },
        )
        .exec();

      this.events.emitToWorkflow(workflowId, 'workflow:generating', {
        workflowId,
      });

      const rule = await this.ruleService.getRuleById(ruleId, auth);
      const generatedNodes = await this.workflowGeneration.generate(
        rule,
        contentPrompt,
      );
      const nodeIds = await this.persistGeneratedNodes(
        workflowId,
        generatedNodes,
        auth.userId,
        auth,
      );

      await this.workflowModel
        .updateOne(
          mergeUserIdFilter({ workflowId }, auth),
          {
            $set: {
              nodes: nodeIds,
              status: WorkflowStatus.Ready,
              version: 1,
            },
            $push: {
              versions: {
                versionNumber: 1,
                nodes: nodeIds,
                createdAt: new Date(),
              },
            },
          },
        )
        .exec();

      const nodes = await this.workflowNodeModel
        .find(mergeUserIdFilter({ workflowRef: workflowId }, auth))
        .sort({ order: 1 })
        .lean()
        .exec();

      this.events.emitToWorkflow(workflowId, 'workflow:completed', {
        workflowId,
        nodes,
      });
    } catch (error) {
      this.logger.error(
        `Workflow generation failed for ${workflowId}`,
        error as Error,
      );
      await this.workflowModel
        .updateOne(
          mergeUserIdFilter({ workflowId }, auth),
          { $set: { status: WorkflowStatus.Failed } },
        )
        .exec();
      this.events.emitToWorkflow(workflowId, 'workflow:failed', {
        workflowId,
        message: 'Workflow generation failed',
      });
    }
  }

  private async createWorkflow(
    ruleRef: string,
    prompt: string,
    userId: string,
  ): Promise<WorkflowDocument> {
    return this.workflowModel.create({
      name: `Workflow for: ${prompt.slice(0, 64)}`,
      ruleRef,
      userId,
      status: WorkflowStatus.Generating,
      nodes: [],
      versions: [],
    });
  }

  private async persistGeneratedNodes(
    workflowId: string,
    nodes: GeneratedWorkflowNode[],
    userId: string,
    auth: TenancyAuth,
  ): Promise<string[]> {
    const normalized = [...nodes]
      .sort((a, b) => a.order - b.order)
      .map((n, idx) => ({
        ...n,
        order: idx + 1,
        isLocked:
          n.type === WorkflowNodeType.TextGeneration
            ? true
            : Boolean(n.isLocked),
      }));
    for (const node of normalized) {
      this.llm.validateWorkflowNodeConfig(node.type, node.config);
    }
    if (
      !normalized.length ||
      normalized[0].type !== WorkflowNodeType.TextGeneration
    ) {
      throw new BadRequestException(
        'Generated workflow must start with text_generation node',
      );
    }

    await this.workflowNodeModel
      .deleteMany(mergeUserIdFilter({ workflowRef: workflowId }, auth))
      .exec();
    const created = await this.workflowNodeModel.create(
      normalized.map((n) => ({
        workflowRef: workflowId,
        userId,
        type: n.type,
        order: n.order,
        isLocked: n.isLocked,
        userPrompt: n.userPrompt,
        config: n.config,
      })),
    );
    return created.map((n) => n.nodeId);
  }
}
