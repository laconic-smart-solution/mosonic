import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
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
import { workflowCompletedNotification } from '../events/notification.util';
import { RuleService } from '../rule/rule.service';
import {
  GenerateWorkflowRequestDto,
  GenerateWorkflowResponseDto,
  RegenerateWorkflowByRuleRequestDto,
  RegenerateWorkflowByRuleResponseDto,
} from './dto/generate-workflow.dto';
import {
  SaveWorkflowNodesByRuleRequestDto,
  SaveWorkflowNodesByRuleResponseDto,
  SaveWorkflowNodesRequestDto,
  SaveWorkflowNodesResponseDto,
} from './dto/save-workflow-nodes.dto';
import {
  UpdateWorkflowDto,
  UpdateWorkflowResponseDto,
} from './dto/update-workflow.dto';
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
import {
  assignNodeIds,
  expandGraphLaneTemplates,
} from './workflow-graph-expand.util';
import {
  assertEdgesRespectMatrix,
  buildWorkflowEdges,
} from './workflow-graph-edge-builder.util';
import {
  buildLinearEdgesFromOrder,
  normalizeLaneId,
  validateWorkflowGraph,
  type WorkflowGraphEdge,
} from './workflow-graph.util';

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
          { $set: { status: WorkflowStatus.Generating } },
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
    workflow: {
      workflowId: string;
      name: string;
      status: WorkflowStatus;
      ruleRef: string;
    };
    nodes: Array<{
      nodeId: string;
      type: WorkflowNodeType;
      order: number;
      isLocked: boolean;
      config: Record<string, unknown>;
      x?: number;
      y?: number;
      lane?: string | null;
    }>;
    edges: WorkflowGraphEdge[];
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
    return this.mapWorkflowResponse(workflow, nodes);
  }

  async getWorkflowByRuleId(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<{
    workflow: {
      workflowId: string;
      name: string;
      status: WorkflowStatus;
      ruleRef: string;
    };
    nodes: Array<{
      nodeId: string;
      type: WorkflowNodeType;
      order: number;
      isLocked: boolean;
      config: Record<string, unknown>;
      x?: number;
      y?: number;
      lane?: string | null;
    }>;
    edges: WorkflowGraphEdge[];
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
    return this.mapWorkflowResponse(workflow, nodes);
  }

  private mapWorkflowResponse(
    workflow: WorkflowDocument,
    nodes: WorkflowNodeDocument[],
  ) {
    const nodeRows = nodes.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      order: n.order,
      isLocked: n.isLocked,
      config: (n.config ?? {}) as Record<string, unknown>,
      ...(typeof n.x === 'number' && Number.isFinite(n.x) ? { x: n.x } : {}),
      ...(typeof n.y === 'number' && Number.isFinite(n.y) ? { y: n.y } : {}),
      ...(typeof n.lane === 'string' && n.lane.trim()
        ? { lane: n.lane.trim() }
        : {}),
    }));
    const storedEdges = (workflow.edges ?? []).map((e) => ({
      from: e.from,
      to: e.to,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
    }));
    const edges =
      storedEdges.length > 0
        ? storedEdges
        : buildLinearEdgesFromOrder(nodeRows);
    return {
      workflow: {
        workflowId: workflow.workflowId,
        name: workflow.name,
        status: workflow.status,
        ruleRef: workflow.ruleRef,
      },
      nodes: nodeRows,
      edges,
    };
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

  async updateWorkflow(
    workflowId: string,
    body: UpdateWorkflowDto,
    auth: TenancyAuth,
  ): Promise<UpdateWorkflowResponseDto> {
    const normalizedId = workflowId.trim();
    if (!normalizedId) {
      throw new BadRequestException('workflowId must not be empty');
    }
    const nameTrimmed = body.name.trim();
    const workflowName = nameTrimmed || 'Untitled Workflow';

    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId: normalizedId }, auth))
      .exec();
    if (!workflow) {
      throw new NotFoundException(`Workflow ${normalizedId} not found`);
    }

    await this.workflowModel
      .updateOne(
        mergeUserIdFilter({ workflowId: normalizedId }, auth),
        { $set: { name: workflowName } },
      )
      .exec();

    return { workflowId: normalizedId, name: workflowName };
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

    const nameTrimmed = body.name?.trim();
    if (nameTrimmed) {
      await this.workflowModel
        .updateOne(
          mergeUserIdFilter({ workflowId }, auth),
          { $set: { name: nameTrimmed } },
        )
        .exec();
    }

    const normalized = this.normalizeAndValidateNodes(body.nodes);
    const ownerUserId = workflow.userId ?? auth.userId;

    const nodeSpecs = normalized.map((n) => ({
      nodeId: n.nodeId?.trim() || randomUUID(),
      type: n.type,
      order: n.order,
      isLocked: n.isLocked,
      config: n.config,
      ...(typeof n.x === 'number' && Number.isFinite(n.x) ? { x: n.x } : {}),
      ...(typeof n.y === 'number' && Number.isFinite(n.y) ? { y: n.y } : {}),
      lane: n.lane ?? null,
    }));

    const nodeIdSet = new Set(nodeSpecs.map((n) => n.nodeId));
    const edges: WorkflowGraphEdge[] = (body.edges ?? [])
      .map((e) => ({
        from: e.from.trim(),
        to: e.to.trim(),
        ...(e.sourceHandle?.trim()
          ? { sourceHandle: e.sourceHandle.trim() }
          : {}),
        ...(e.targetHandle?.trim()
          ? { targetHandle: e.targetHandle.trim() }
          : {}),
      }))
      .filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to));

    const forValidation = nodeSpecs.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      order: n.order,
    }));
    validateWorkflowGraph(forValidation, edges);
    if (edges.length > 0) {
      assertEdgesRespectMatrix(forValidation, edges);
    }

    const nodeIds = nodeSpecs.map((n) => n.nodeId);
    await this.workflowNodeModel
      .deleteMany({
        ...mergeUserIdFilter({ workflowRef: workflowId }, auth),
        nodeId: { $nin: nodeIds },
      })
      .exec();

    for (const spec of nodeSpecs) {
      await this.workflowNodeModel
        .findOneAndUpdate(
          mergeUserIdFilter({ workflowRef: workflowId, nodeId: spec.nodeId }, auth),
          {
            $set: {
              workflowRef: workflowId,
              userId: ownerUserId,
              type: spec.type,
              order: spec.order,
              isLocked: spec.isLocked,
              config: spec.config,
              ...('x' in spec && spec.x !== undefined ? { x: spec.x } : {}),
              ...('y' in spec && spec.y !== undefined ? { y: spec.y } : {}),
              lane: spec.lane ?? null,
            },
          },
          { upsert: true },
        )
        .exec();
    }

    const persistedEdges =
      edges.length > 0 ? edges : buildLinearEdgesFromOrder(nodeSpecs);

    const nextVersion = (workflow.version ?? 1) + 1;
    await this.workflowModel
      .updateOne(
        mergeUserIdFilter({ workflowId }, auth),
        {
          $set: {
            nodes: nodeIds,
            edges: persistedEdges,
            version: nextVersion,
          },
          $push: {
            versions: {
              versionNumber: nextVersion,
              nodes: nodeIds,
              edges: persistedEdges,
              createdAt: new Date(),
            },
          },
        },
      )
      .exec();

    return { success: true };
  }

  async saveNodesForRule(
    ruleId: string,
    body: SaveWorkflowNodesByRuleRequestDto,
    auth: TenancyAuth,
  ): Promise<SaveWorkflowNodesByRuleResponseDto> {
    const normalizedRuleId = ruleId.trim();
    if (!normalizedRuleId) {
      throw new BadRequestException('ruleId must not be empty');
    }

    await this.ruleService.getRuleById(normalizedRuleId, auth);

    const nameTrimmed = body.name?.trim();
    const workflowName = nameTrimmed || 'Untitled Workflow';

    let workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ ruleRef: normalizedRuleId }, auth))
      .sort({ createdAt: -1 })
      .exec();

    if (!workflow) {
      workflow = await this.workflowModel.create({
        name: workflowName,
        ruleRef: normalizedRuleId,
        userId: auth.userId,
        status: WorkflowStatus.Ready,
        nodes: [],
        edges: [],
        versions: [],
      });
    } else if (nameTrimmed) {
      await this.workflowModel
        .updateOne(
          mergeUserIdFilter({ workflowId: workflow.workflowId }, auth),
          { $set: { name: workflowName } },
        )
        .exec();
    }

    const { name: _name, ...saveBody } = body;
    await this.saveNodes(workflow.workflowId, saveBody, auth);

    return { workflowId: workflow.workflowId, success: true };
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
    nodeId?: string;
    type: WorkflowNodeType;
    order: number;
    isLocked: boolean;
    config: WorkflowNodeConfig;
    x?: number;
    y?: number;
    lane?: string | null;
  }> {
    if (!nodes.length) {
      throw new BadRequestException('nodes must not be empty');
    }
    const sorted = [...nodes].sort((a, b) => a.order - b.order);
    const normalized = sorted.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      order: n.order,
      isLocked: false,
      ...(typeof n.x === 'number' && Number.isFinite(n.x) ? { x: n.x } : {}),
      ...(typeof n.y === 'number' && Number.isFinite(n.y) ? { y: n.y } : {}),
      lane:
        typeof n.lane === 'string' && n.lane.trim()
          ? n.lane.trim()
          : null,
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
        { userId: auth.userId, workflowId },
      );
      const channelIds = (rule.channels ?? []).map((ch) =>
        normalizeLaneId(ch.channel),
      );
      const { nodeIds, edges: persistedEdges } =
        await this.persistGeneratedNodes(
          workflowId,
          generatedNodes,
          auth.userId,
          auth,
          channelIds,
        );

      await this.workflowModel
        .updateOne(
          mergeUserIdFilter({ workflowId }, auth),
          {
            $set: {
              nodes: nodeIds,
              edges: persistedEdges,
              status: WorkflowStatus.Ready,
              version: 1,
            },
            $push: {
              versions: {
                versionNumber: 1,
                nodes: nodeIds,
                edges: persistedEdges,
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
        edges: persistedEdges,
      });

      const notif = workflowCompletedNotification({
        workflowId,
        ruleRef: ruleId,
      });
      this.events.emitUserNotification({
        userId: auth.userId,
        sector: 'workflow',
        type: 'workflow.completed',
        ...notif,
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
    channelIds: string[],
  ): Promise<{ nodeIds: string[]; edges: WorkflowGraphEdge[] }> {
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
          isLocked: false,
          config: parsed.data as Record<string, unknown>,
        };
      });
    for (const node of normalized) {
      this.llm.validateWorkflowNodeConfig(node.type, node.config);
    }
    assertValidWorkflowNodeOrder(
      normalized.map((n) => ({
        type: n.type,
        order: n.order,
        config: n.config,
      })),
    );

    let graphNodes = assignNodeIds(normalized);
    graphNodes = expandGraphLaneTemplates(graphNodes, channelIds);

    const edges = buildWorkflowEdges(graphNodes);
    const forValidation = graphNodes.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      order: n.order,
    }));
    validateWorkflowGraph(forValidation, edges);
    assertEdgesRespectMatrix(forValidation, edges);

    await this.workflowNodeModel
      .deleteMany(mergeUserIdFilter({ workflowRef: workflowId }, auth))
      .exec();
    for (const n of graphNodes) {
      await this.workflowNodeModel.create({
        workflowRef: workflowId,
        nodeId: n.nodeId,
        userId,
        type: n.type,
        order: n.order,
        isLocked: n.isLocked,
        config: n.config as WorkflowNodeConfig,
        lane: n.lane ?? undefined,
      });
    }
    return { nodeIds: graphNodes.map((n) => n.nodeId), edges };
  }

  async listTemplates(auth: TenancyAuth) {
    const rows = await this.workflowModel
      .find(mergeUserIdFilter({ isTemplate: true }, auth))
      .select({
        workflowId: 1,
        templateName: 1,
        name: 1,
        updatedAt: 1,
      })
      .sort({ templateName: 1 })
      .lean()
      .exec();
    return rows.map((r) => {
      const row = r as {
        workflowId?: string;
        templateName?: string | null;
        name?: string;
        updatedAt?: Date | string;
      };
      return {
        workflowId: String(row.workflowId),
        templateName: row.templateName ?? String(row.name),
        name: String(row.name),
        updatedAt:
          row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : String(row.updatedAt ?? ''),
      };
    });
  }

  async saveAsTemplate(
    workflowId: string,
    templateName: string,
    auth: TenancyAuth,
  ) {
    const name = templateName.trim();
    if (!name) {
      throw new BadRequestException('templateName is required');
    }
    const source = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId }, auth))
      .exec();
    if (!source) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    const nodes = await this.workflowNodeModel
      .find(mergeUserIdFilter({ workflowRef: workflowId }, auth))
      .sort({ order: 1 })
      .exec();
    const edges = source.edges ?? [];

    const clone = await this.workflowModel.create({
      userId: auth.userId,
      ruleRef: source.ruleRef,
      name: name,
      isTemplate: true,
      templateName: name,
      status: WorkflowStatus.Ready,
      nodes: [],
      edges,
      versions: [],
    });

    if (nodes.length > 0) {
      const created = await this.workflowNodeModel.create(
        nodes.map((n) => ({
          workflowRef: clone.workflowId,
          userId: auth.userId,
          type: n.type,
          order: n.order,
          isLocked: n.isLocked,
          config: n.config ?? {},
        })),
      );
      clone.nodes = created.map((n) => n.nodeId);
      await clone.save();
    }

    return { workflowId: clone.workflowId, templateName: name };
  }

  async applyTemplate(
    templateId: string,
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<{ workflowId: string }> {
    const template = await this.workflowModel
      .findOne(
        mergeUserIdFilter({ workflowId: templateId, isTemplate: true }, auth),
      )
      .exec();
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    const nodes = await this.workflowNodeModel
      .find(mergeUserIdFilter({ workflowRef: templateId }, auth))
      .sort({ order: 1 })
      .exec();

    const workflow = await this.workflowModel.create({
      userId: auth.userId,
      ruleRef: ruleId,
      name: `From template: ${template.templateName ?? template.name}`,
      isTemplate: false,
      templateName: null,
      status: WorkflowStatus.Ready,
      nodes: [],
      edges: template.edges ?? [],
      versions: [],
    });

    if (nodes.length > 0) {
      const created = await this.workflowNodeModel.create(
        nodes.map((n) => ({
          workflowRef: workflow.workflowId,
          userId: auth.userId,
          type: n.type,
          order: n.order,
          isLocked: n.isLocked,
          config: n.config ?? {},
        })),
      );
      workflow.nodes = created.map((n) => n.nodeId);
    }
    await workflow.save();
    return { workflowId: workflow.workflowId };
  }

  async archiveTemplate(templateId: string, auth: TenancyAuth) {
    const doc = await this.workflowModel
      .findOneAndUpdate(
        mergeUserIdFilter(
          { workflowId: templateId, isTemplate: true },
          auth,
        ),
        { status: WorkflowStatus.Archived },
        { new: true },
      )
      .exec();
    if (!doc) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }
    return { success: true };
  }
}
