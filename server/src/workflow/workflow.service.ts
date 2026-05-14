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
  type WorkflowNodeConfig,
  type WorkflowNodeDocument,
} from '../nodes/schemas/workflow-node.schema';
import { parseWorkflowNodeConfig } from '../nodes/workflow-node-config.zod';
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
import type {
  WorkflowPageItemDto,
  WorkflowPageQueryDto,
} from './dto/workflow-page-query.dto';
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
import { assertValidWorkflowNodeOrder } from './workflow-node-order.util';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  async findPage(
    dto: WorkflowPageQueryDto,
    auth: TenancyAuth,
  ): Promise<{ data: WorkflowPageItemDto[]; total: number }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const sortBy = dto.sortBy ?? 'updatedAt';
    const sortOrder = dto.sortOrder ?? 'desc';
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = mergeUserIdFilter({}, auth);
    const q = dto.filter?.q?.trim();
    if (q) {
      filter.name = {
        $regex: escapeRegex(q),
        $options: 'i',
      };
    }
    if (dto.filter?.nodeType !== undefined) {
      const refs = await this.workflowNodeModel
        .distinct(
          'workflowRef',
          mergeUserIdFilter({ type: dto.filter.nodeType }, auth),
        )
        .exec();
      if (!refs.length) {
        return { data: [], total: 0 };
      }
      filter.workflowId = { $in: refs };
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortDir };

    const [rows, total] = await Promise.all([
      this.workflowModel
        .find(filter)
        .select({
          workflowId: 1,
          ruleRef: 1,
          name: 1,
          status: 1,
          updatedAt: 1,
        })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.workflowModel.countDocuments(filter).exec(),
    ]);

    const ids = (rows as Array<{ workflowId?: string }>)
      .map((r) => r.workflowId)
      .filter((id): id is string => Boolean(id?.trim()));

    const nodeTypesByWorkflow = await this.loadNodeTypesForWorkflows(
      ids,
      auth,
    );

    type WorkflowLean = {
      workflowId?: string;
      ruleRef?: string;
      name?: string;
      status?: string;
      updatedAt?: Date | string;
    };
    const data: WorkflowPageItemDto[] = (rows as WorkflowLean[]).map((row) => {
      const workflowId = row.workflowId?.trim() ?? '';
      const updatedAtRaw = row.updatedAt;
      const updatedAt =
        updatedAtRaw instanceof Date
          ? updatedAtRaw.toISOString()
          : typeof updatedAtRaw === 'string'
            ? updatedAtRaw
            : new Date().toISOString();
      return {
        workflowId,
        ruleRef: row.ruleRef?.trim() ?? '',
        name: row.name?.trim() ?? '',
        status:
          typeof row.status === 'string'
            ? row.status
            : String(row.status ?? WorkflowStatus.Generating),
        updatedAt,
        nodeTypes: nodeTypesByWorkflow.get(workflowId) ?? [],
      };
    });

    return { data, total };
  }

  private async loadNodeTypesForWorkflows(
    workflowIds: string[],
    auth: TenancyAuth,
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!workflowIds.length) return out;
    const nodes = await this.workflowNodeModel
      .find(mergeUserIdFilter({ workflowRef: { $in: workflowIds } }, auth))
      .select({ workflowRef: 1, type: 1 })
      .lean()
      .exec();
    for (const n of nodes) {
      const ref =
        typeof n.workflowRef === 'string' ? n.workflowRef.trim() : '';
      const type = typeof n.type === 'string' ? n.type : String(n.type ?? '');
      if (!ref || !type) continue;
      const set = new Set(out.get(ref) ?? []);
      set.add(type);
      out.set(ref, Array.from(set));
    }
    return out;
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

  /**
   * Appends a single node to an existing workflow (e.g. Generate More).
   * Does not re-run full saveNodes validation; caller must pass an allowed type.
   */
  async appendWorkflowNode(
    workflowId: string,
    args: {
      nodeId: string;
      type: WorkflowNodeType;
      config: WorkflowNodeConfig;
      userPrompt?: string;
    },
    auth: TenancyAuth,
  ): Promise<{ nodeId: string; order: number }> {
    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId }, auth))
      .exec();
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const last = await this.workflowNodeModel
      .findOne(mergeUserIdFilter({ workflowRef: workflowId }, auth))
      .sort({ order: -1 })
      .select({ order: 1 })
      .lean()
      .exec();
    const nextOrder = (last?.order ?? 0) + 1;
    const ownerUserId = workflow.userId ?? auth.userId;

    await this.workflowNodeModel.create({
      nodeId: args.nodeId,
      workflowRef: workflowId,
      userId: ownerUserId,
      type: args.type,
      order: nextOrder,
      isLocked: false,
      userPrompt: args.userPrompt?.trim() ?? '',
      config: args.config ?? {},
    });

    const nextVersion = (workflow.version ?? 1) + 1;
    const nextNodeIds = [...(workflow.nodes ?? []), args.nodeId];
    await this.workflowModel
      .updateOne(mergeUserIdFilter({ workflowId }, auth), {
        $push: {
          nodes: args.nodeId,
          versions: {
            versionNumber: nextVersion,
            nodes: nextNodeIds,
            createdAt: new Date(),
          },
        },
        $set: { version: nextVersion },
      })
      .exec();

    return { nodeId: args.nodeId, order: nextOrder };
  }

  private normalizeAndValidateNodes(
    nodes: SaveWorkflowNodesRequestDto['nodes'],
  ): Array<{
    type: WorkflowNodeType;
    order: number;
    isLocked: boolean;
    config: WorkflowNodeConfig;
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
    const normalized = sorted.map((n, idx) => ({
      type: n.type,
      order: idx + 1,
      isLocked: Boolean(n.isLocked),
      config: (() => {
        const parsed = parseWorkflowNodeConfig(n.type, n.config ?? {});
        if (!parsed.ok) {
          throw new BadRequestException(
            `Invalid config for node "${n.type}": ${parsed.errors.join('; ')}`,
          );
        }
        return parsed.data;
      })(),
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
    assertValidWorkflowNodeOrder(
      normalized.map((n) => ({
        type: n.type,
        order: n.order,
        config: n.config as Record<string, unknown>,
      })),
    );
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
      .map((n, idx) => {
        const parsed = parseWorkflowNodeConfig(n.type, n.config);
        if (!parsed.ok) {
          throw new BadRequestException(
            `Invalid generated config for node "${n.type}": ${parsed.errors.join('; ')}`,
          );
        }
        return {
          ...n,
          order: idx + 1,
          isLocked: Boolean(n.isLocked),
          config: parsed.data,
        };
      });
    for (const node of normalized) {
      this.llm.validateWorkflowNodeConfig(node.type, node.config);
    }
    assertValidWorkflowNodeOrder(
      normalized.map((n) => ({
        type: n.type,
        order: n.order,
        config: n.config as Record<string, unknown>,
      })),
    );

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
        config: n.config,
      })),
    );
    return created.map((n) => n.nodeId);
  }
}
