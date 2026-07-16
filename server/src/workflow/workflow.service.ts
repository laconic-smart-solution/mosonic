import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeTenancyWhere } from '../repositories/prisma/prisma.util';
import {
  WorkflowNodeType,
  type WorkflowNodeConfig,
} from '../nodes/schemas/workflow-node.schema';
import { parseWorkflowNodeConfig } from '../nodes/workflow-node-config.zod';
import { EventsService } from '../events/events.service';
import { workflowCompletedNotification } from '../events/notification.util';
import { CreditService } from '../credit/credit.service';
import { currentBillingPeriod } from '../credit/lib/billing-period.util';
import { WORKFLOW_GENERATION_NODE_TYPE } from '../credit/lib/billable-node-credit-types';
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
  WorkflowStatus,
} from './schemas/workflow.schema';
import { WorkflowGenerationService } from './services/workflow-generation.service';
import { LlmService } from '../llm/llm.service';
import {
  resolveQaNodeChannels,
  resolveRuleChannelIds,
} from './workflow-qa-channels.constants';
import type { WorkflowQAAnswersDto } from './dto/workflow-qa-answers.dto';
import type { GeneratedWorkflowNode } from './workflow-structure.builder';
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
  assignOrderFromGraph,
  buildLinearEdgesFromOrder,
  normalizeLaneId,
  stripDisconnectedNodes,
  validateWorkflowGraph,
  type WorkflowGraphEdge,
} from './workflow-graph.util';
import {
  collapsePipelineToWorkflowTemplate,
  dedupeAdaptNodesPerLane,
} from './pipeline-to-workflow-template.util';
import type { ApplyPipelineToWorkflowResponseDto } from './dto/apply-pipeline-to-workflow.dto';
import type { WorkflowRecord, WorkflowNodeRecord } from '../domain/workflow/workflow.types';
import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import type { IWorkflowRepository } from '../repositories/interfaces/workflow.repository.interface';
import type { IWorkflowNodeRepository } from '../repositories/interfaces/workflow-node.repository.interface';
import type { IPipelineRepository } from '../repositories/interfaces/pipeline.repository.interface';
import {
  PIPELINE_REPOSITORY,
  WORKFLOW_NODE_REPOSITORY,
  WORKFLOW_REPOSITORY,
} from '../repositories/tokens';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflows: IWorkflowRepository,
    @Inject(WORKFLOW_NODE_REPOSITORY)
    private readonly workflowNodes: IWorkflowNodeRepository,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    private readonly workflowGeneration: WorkflowGenerationService,
    private readonly llm: LlmService,
    private readonly ruleService: RuleService,
    private readonly events: EventsService,
    private readonly creditService: CreditService,
  ) {}

  async generateWorkflow(
    body: GenerateWorkflowRequestDto,
    auth: TenancyAuth,
  ): Promise<GenerateWorkflowResponseDto> {
    const ruleId = body.ruleId.trim();
    if (!ruleId) {
      throw new BadRequestException('ruleId must not be empty');
    }

    return this.regenerateWorkflowByRuleId(ruleId, { answers: body.answers }, auth);
  }

  /**
   * Apply the fixed default node graph (keyword → intelligence → text ± branch).
   * No LLM and no workflow-generation credit charge.
   */
  async applyDefaultWorkflowStructure(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<GenerateWorkflowResponseDto> {
    const normalizedRuleId = ruleId.trim();
    if (!normalizedRuleId) {
      throw new BadRequestException('ruleId must not be empty');
    }

    const rule = await this.ruleService.getRuleById(normalizedRuleId, auth);
    const ruleChannelIds = resolveRuleChannelIds(
      (Array.isArray(rule.channels) ? rule.channels : []) as never[],
    );
    if (!ruleChannelIds.length) {
      throw new BadRequestException(
        'Rule must include at least one distribution channel before creating a workflow',
      );
    }

    const existing = await this.workflows.findLatestByRule(
      normalizedRuleId,
      auth,
    );
    const workflowName = this.workflowNameFromAnswers('', normalizedRuleId);
    const workflow =
      existing ??
      (await this.createWorkflow(
        normalizedRuleId,
        workflowName,
        auth.userId,
      ));

    if (existing?.workflowId) {
      await this.workflows.updateById(
        existing.workflowId,
        { status: WorkflowStatus.Generating, name: existing.name || workflowName },
        auth,
      );
    }

    await this.workflows.updateById(
      workflow.workflowId,
      { ruleRef: normalizedRuleId },
      auth,
    );

    const generatedNodes =
      this.workflowGeneration.buildDefaultStructure(rule as never);
    const { nodeIds, edges: persistedEdges } =
      await this.persistGeneratedNodes(
        workflow.workflowId,
        generatedNodes,
        auth.userId,
        auth,
        ruleChannelIds,
      );

    await this.workflows.appendVersion(
      workflow.workflowId,
      {
        versionNumber: 1,
        nodes: nodeIds,
        edges: persistedEdges,
        createdAt: new Date(),
      },
      {
        nodes: nodeIds,
        edges: persistedEdges as unknown as never,
        status: WorkflowStatus.Ready,
        version: 1,
      },
      auth,
    );

    const nodes = await this.workflowNodes.findByWorkflow(
      workflow.workflowId,
      auth,
    );
    this.events.emitToWorkflow(workflow.workflowId, 'workflow:completed', {
      workflowId: workflow.workflowId,
      nodes,
      edges: persistedEdges,
    });

    return { workflowId: workflow.workflowId, ruleId: normalizedRuleId };
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

    const answers = body.answers;

    const rule = await this.ruleService.getRuleById(normalizedRuleId, auth);
    const ruleChannelIds = resolveRuleChannelIds(
      (Array.isArray(rule.channels) ? rule.channels : []) as never[],
    );
    if (!ruleChannelIds.length) {
      throw new BadRequestException(
        'Rule must include at least one distribution channel before generating a workflow',
      );
    }

    const normalizedAnswers = this.normalizeWorkflowQaAnswers(
      answers,
      ruleChannelIds,
    );

    await this.creditService.assertCreditsForNodeType(
      auth.userId,
      WORKFLOW_GENERATION_NODE_TYPE,
    );

    const existing = await this.workflows.findLatestByRule(normalizedRuleId, auth);
    const workflowName = this.workflowNameFromAnswers(
      normalizedAnswers.additionalMessage,
      normalizedRuleId,
    );
    const workflow =
      existing ??
      (await this.createWorkflow(
        normalizedRuleId,
        workflowName,
        auth.userId,
      ));

    if (existing?.workflowId) {
      await this.workflows.updateById(
        existing.workflowId,
        { status: WorkflowStatus.Generating, name: workflowName },
        auth,
      );
    }

    void this.runGeneration(
      workflow.workflowId,
      normalizedAnswers,
      normalizedRuleId,
      auth,
      ruleChannelIds,
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
    const workflow = await this.workflows.findById(workflowId, auth);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    const nodes = await this.workflowNodes.findByWorkflow(workflowId, auth);
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
    const workflow = await this.workflows.findLatestByRule(ruleId, auth);
    if (!workflow) return null;
    const nodes = await this.workflowNodes.findByWorkflow(workflow.workflowId, auth);
    return this.mapWorkflowResponse(workflow, nodes);
  }

  private mapWorkflowResponse(
    workflow: WorkflowRecord,
    nodes: WorkflowNodeRecord[],
  ) {
    const nodeRows = nodes.map((n) => ({
      nodeId: n.nodeId,
      type: n.type as unknown as WorkflowNodeType,
      order: n.order,
      isLocked: n.isLocked,
      config: (n.config ?? {}) as Record<string, unknown>,
      ...(typeof n.x === 'number' && Number.isFinite(n.x) ? { x: n.x } : {}),
      ...(typeof n.y === 'number' && Number.isFinite(n.y) ? { y: n.y } : {}),
      ...(typeof n.lane === 'string' && n.lane.trim()
        ? { lane: n.lane.trim() }
        : {}),
    }));
    const rawEdges = Array.isArray(workflow.edges) ? workflow.edges : [];
    const storedEdges = rawEdges
      .map((edge) => {
        if (!edge || typeof edge !== 'object') return null;
        const e = edge as {
          from?: unknown;
          to?: unknown;
          sourceHandle?: unknown;
          targetHandle?: unknown;
        };
        if (typeof e.from !== 'string' || typeof e.to !== 'string') {
          return null;
        }
        return {
          from: e.from,
          to: e.to,
          ...(typeof e.sourceHandle === 'string' && e.sourceHandle
            ? { sourceHandle: e.sourceHandle }
            : {}),
          ...(typeof e.targetHandle === 'string' && e.targetHandle
            ? { targetHandle: e.targetHandle }
            : {}),
        };
      })
      .filter((edge): edge is WorkflowGraphEdge => Boolean(edge));
    const edges =
      storedEdges.length > 0
        ? storedEdges
        : buildLinearEdgesFromOrder(nodeRows);
    return {
      workflow: {
        workflowId: workflow.workflowId,
        name: workflow.name,
        status: workflow.status as unknown as WorkflowStatus,
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
    const filter = mergeTenancyWhere({}, auth) as Record<string, unknown>;
    const q = dto.filter?.q?.trim();
    if (q) {
      filter.name = { contains: q, mode: 'insensitive' };
    }
    if (dto.filter?.nodeType !== undefined) {
      const refs = await this.workflowNodes.distinctWorkflowRefsByType(
        dto.filter.nodeType,
        auth,
      );
      if (!refs.length) {
        return { data: [], total: 0 };
      }
      filter.workflowId = { in: refs };
    }
    const { rows, total } = await this.workflows.findPage(
      filter,
      page,
      limit,
      sortBy,
      sortOrder,
    );

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
    const nodes = await this.workflowNodes.findByWorkflowRefs(workflowIds, auth);
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

    const workflow = await this.workflows.findById(normalizedId, auth);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${normalizedId} not found`);
    }

    await this.workflows.updateById(normalizedId, { name: workflowName }, auth);

    return { workflowId: normalizedId, name: workflowName };
  }

  async saveNodes(
    workflowId: string,
    body: SaveWorkflowNodesRequestDto,
    auth: TenancyAuth,
  ): Promise<SaveWorkflowNodesResponseDto> {
    const workflow = await this.workflows.findById(workflowId, auth);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const nameTrimmed = body.name?.trim();
    if (nameTrimmed) {
      await this.workflows.updateById(workflowId, { name: nameTrimmed }, auth);
    }

    const normalized = this.normalizeAndValidateNodes(body.nodes, {
      skipOrderValidation: true,
    });
    const ownerUserId = workflow.userId ?? auth.userId;

    let nodeSpecs = normalized.map((n) => ({
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

    nodeSpecs = stripDisconnectedNodes(nodeSpecs, edges);
    nodeSpecs = assignOrderFromGraph(nodeSpecs, edges);

    const forValidation = nodeSpecs.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      order: n.order,
    }));
    validateWorkflowGraph(forValidation, edges);
    this.assertWorkflowNodeOrder(nodeSpecs);
    if (edges.length > 0) {
      assertEdgesRespectMatrix(forValidation, edges);
    }

    const nodeIds = nodeSpecs.map((n) => n.nodeId);
    await this.workflowNodes.deleteExcept(workflowId, nodeIds, auth);

    for (const spec of nodeSpecs) {
      await this.workflowNodes.upsertNode(
        workflowId,
        spec.nodeId,
        {
          nodeId: spec.nodeId,
          workflow: { connect: { workflowId } },
          userId: ownerUserId,
          type: spec.type,
          order: spec.order,
          isLocked: spec.isLocked,
          userPrompt: '',
          config: spec.config as never,
          ...('x' in spec && spec.x !== undefined ? { x: spec.x } : {}),
          ...('y' in spec && spec.y !== undefined ? { y: spec.y } : {}),
          lane: spec.lane ?? null,
        },
        auth,
      );
    }

    const persistedEdges =
      edges.length > 0 ? edges : buildLinearEdgesFromOrder(nodeSpecs);

    const nextVersion = (workflow.version ?? 1) + 1;
    await this.workflows.appendVersion(
      workflowId,
      {
        versionNumber: nextVersion,
        nodes: nodeIds,
        edges: persistedEdges,
        createdAt: new Date(),
      },
      {
        nodes: nodeIds,
        edges: persistedEdges as unknown as never,
        version: nextVersion,
      },
      auth,
    );

    return { success: true };
  }

  async applyPipelineToWorkflow(
    ruleId: string,
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<ApplyPipelineToWorkflowResponseDto> {
    const normalizedRuleId = ruleId.trim();
    const normalizedPipelineId = pipelineId.trim();
    if (!normalizedRuleId || !normalizedPipelineId) {
      throw new BadRequestException('ruleId and pipelineId must not be empty');
    }

    const workflow = await this.workflows.findLatestByRule(normalizedRuleId, auth);
    if (!workflow) {
      throw new NotFoundException(
        `No workflow found for rule ${normalizedRuleId}`,
      );
    }

    const pipeline = await this.pipelines.findById(normalizedPipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${normalizedPipelineId} not found`);
    }
    if (pipeline.workflowRef !== workflow.workflowId) {
      throw new BadRequestException(
        'Pipeline does not belong to the workflow for this rule',
      );
    }

    const pipelineNodes = Array.isArray(pipeline.nodes)
      ? (pipeline.nodes as Array<{
          nodeId?: unknown;
          type?: unknown;
          order?: unknown;
          isLocked?: unknown;
          userPrompt?: unknown;
          config?: unknown;
          lane?: unknown;
        }>)
      : [];
    const pipelineGraph =
      pipeline.graph && typeof pipeline.graph === 'object'
        ? (pipeline.graph as {
            edges?: Array<{
              from?: unknown;
              to?: unknown;
              sourceHandle?: unknown;
              targetHandle?: unknown;
            }>;
            lanes?: unknown[];
            layout?: Record<string, { x: number; y: number }>;
          })
        : {};
    const collapsed = collapsePipelineToWorkflowTemplate(
      pipelineNodes
        .filter((node) => typeof node.nodeId === 'string')
        .map((node) => {
          const nodeId = node.nodeId as string;
          return {
            nodeId,
            type: String(node.type ?? '') as WorkflowNodeType,
            order: Number(node.order ?? 0),
            isLocked: Boolean(node.isLocked),
            userPrompt: typeof node.userPrompt === 'string' ? node.userPrompt : '',
            config: (node.config ?? {}) as Record<string, unknown>,
            lane: typeof node.lane === 'string' ? node.lane : null,
          };
        }),
      {
        edges: (pipelineGraph.edges ?? [])
          .filter((edge) => typeof edge.from === 'string' && typeof edge.to === 'string')
          .map((edge) => ({
            from: edge.from as string,
            to: edge.to as string,
            ...(typeof edge.sourceHandle === 'string' && edge.sourceHandle
              ? { sourceHandle: edge.sourceHandle }
              : {}),
            ...(typeof edge.targetHandle === 'string' && edge.targetHandle
              ? { targetHandle: edge.targetHandle }
              : {}),
          })),
        lanes: (Array.isArray(pipelineGraph.lanes)
          ? pipelineGraph.lanes.map((lane) => String(lane))
          : []) as string[],
        layout:
          (pipelineGraph.layout as
            | Record<string, { x: number; y: number }>
            | undefined) ?? {},
      },
    );

    const rule = await this.ruleService.getRuleById(pipeline.ruleRef, auth);
    const ruleChannelIds = resolveRuleChannelIds(
      (Array.isArray(rule.channels) ? rule.channels : []) as never[],
    );
    const pipelineLaneIds = (Array.isArray(pipelineGraph.lanes)
      ? pipelineGraph.lanes
      : []
    ).map((lane) => normalizeLaneId(String(lane)));
    const channelIds = [
      ...new Set(
        [...ruleChannelIds, ...pipelineLaneIds]
          .map((lane) => normalizeLaneId(lane))
          .filter(Boolean),
      ),
    ];
    const graphNodes = dedupeAdaptNodesPerLane(
      expandGraphLaneTemplates(
        collapsed.nodes,
        channelIds.length >= 2 ? channelIds : [],
      ),
    );
    const edges = buildWorkflowEdges(graphNodes);

    const saveNodes = graphNodes.map((node) => {
      const pos = collapsed.layout[node.nodeId];
      return {
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        isLocked: node.isLocked,
        config: node.config,
        ...(typeof node.lane === 'string' && node.lane.trim()
          ? { lane: node.lane.trim() }
          : {}),
        ...(pos ? { x: pos.x, y: pos.y } : {}),
      };
    });

    await this.saveNodes(
      workflow.workflowId,
      { nodes: saveNodes, edges },
      auth,
    );

    return {
      workflowId: workflow.workflowId,
      contentPrompt: pipeline.contentPrompt,
      nodes: graphNodes.map((node) => {
        const pos = collapsed.layout[node.nodeId];
        return {
          nodeId: node.nodeId,
          type: node.type,
          order: node.order,
          isLocked: node.isLocked,
          config: node.config,
          ...(typeof node.lane === 'string' && node.lane.trim()
            ? { lane: node.lane.trim() }
            : {}),
          ...(pos ? { x: pos.x, y: pos.y } : {}),
        };
      }),
      edges,
    };
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

    let workflow = await this.workflows.findLatestByRule(normalizedRuleId, auth);

    if (!workflow) {
      workflow = await this.workflows.create({
        name: workflowName,
        ruleRef: normalizedRuleId,
        userId: auth.userId,
        status: WorkflowStatus.Ready,
        nodes: [],
        edges: [],
        versions: [],
      });
    } else if (nameTrimmed) {
      await this.workflows.updateById(
        workflow.workflowId,
        { name: workflowName },
        auth,
      );
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
    const workflow = await this.workflows.findById(workflowId, auth);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const existingNodes = await this.workflowNodes.findByWorkflow(workflowId, auth);
    const nextOrder = (existingNodes.at(-1)?.order ?? 0) + 1;
    const ownerUserId = workflow.userId ?? auth.userId;

    await this.workflowNodes.create({
      nodeId: args.nodeId,
      workflow: { connect: { workflowId } },
      userId: ownerUserId,
      type: args.type,
      order: nextOrder,
      isLocked: false,
      userPrompt: args.userPrompt?.trim() ?? '',
      config: (args.config ?? {}) as never,
    });

    const nextVersion = (workflow.version ?? 1) + 1;
    const nextNodeIds = [...(workflow.nodes ?? []), args.nodeId];
    await this.workflows.appendVersion(
      workflowId,
      {
        versionNumber: nextVersion,
        nodes: nextNodeIds,
        createdAt: new Date(),
      },
      {
        nodes: nextNodeIds,
        version: nextVersion,
      },
      auth,
    );

    return { nodeId: args.nodeId, order: nextOrder };
  }

  private assertWorkflowNodeOrder(
    nodes: Array<{
      type: WorkflowNodeType;
      order: number;
      config: WorkflowNodeConfig;
    }>,
  ): void {
    assertValidWorkflowNodeOrder(
      nodes.map((n) => ({
        type: n.type,
        order: n.order,
        config: n.config as Record<string, unknown>,
      })),
    );
  }

  private normalizeAndValidateNodes(
    nodes: SaveWorkflowNodesRequestDto['nodes'],
    options?: { skipOrderValidation?: boolean },
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
    if (!options?.skipOrderValidation) {
      this.assertWorkflowNodeOrder(normalized);
    }
    return normalized;
  }

  private async runGeneration(
    workflowId: string,
    answers: RegenerateWorkflowByRuleRequestDto['answers'],
    incomingRuleId: string,
    auth: TenancyAuth,
    publishChannelIds: string[],
  ): Promise<void> {
    try {
      this.events.emitToWorkflow(workflowId, 'workflow:started', {
        workflowId,
      });

      const ruleId = incomingRuleId.trim();
      if (!ruleId) {
        throw new BadRequestException('ruleId must not be empty');
      }

      await this.workflows.updateById(workflowId, { ruleRef: ruleId }, auth);

      this.events.emitToWorkflow(workflowId, 'workflow:generating', {
        workflowId,
      });

      const rule = await this.ruleService.getRuleById(ruleId, auth);
      const generatedNodes = await this.workflowGeneration.generate(
        rule as never,
        answers,
      );
      const { nodeIds, edges: persistedEdges } =
        await this.persistGeneratedNodes(
          workflowId,
          generatedNodes,
          auth.userId,
          auth,
          publishChannelIds,
        );

      await this.workflows.appendVersion(
        workflowId,
        {
          versionNumber: 1,
          nodes: nodeIds,
          edges: persistedEdges,
          createdAt: new Date(),
        },
        {
          nodes: nodeIds,
          edges: persistedEdges as unknown as never,
          status: WorkflowStatus.Ready,
          version: 1,
        },
        auth,
      );

      await this.creditService.deductCredits({
        userId: auth.userId,
        pipelineRef: workflowId,
        campaignRef: ruleId,
        nodeId: 'workflow-generation',
        nodeType: WORKFLOW_GENERATION_NODE_TYPE,
        provider: 'system',
        model: 'system',
        rawCostUsd: 0,
        billingPeriod: currentBillingPeriod(),
      });

      const nodes = await this.workflowNodes.findByWorkflow(workflowId, auth);

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
      await this.workflows.updateById(
        workflowId,
        { status: WorkflowStatus.Failed },
        auth,
      );
      this.events.emitToWorkflow(workflowId, 'workflow:failed', {
        workflowId,
        message: 'Workflow generation failed',
      });
    }
  }

  private async createWorkflow(
    ruleRef: string,
    name: string,
    userId: string,
  ): Promise<WorkflowRecord> {
    return this.workflows.create({
      name,
      ruleRef,
      userId,
      status: WorkflowStatus.Generating,
      nodes: [],
      edges: [],
      versions: [],
    });
  }

  private normalizeWorkflowQaAnswers(
    answers: WorkflowQAAnswersDto,
    ruleChannelIds: string[],
  ): WorkflowQAAnswersDto {
    const imageChannels = answers.generateImage
      ? resolveQaNodeChannels(answers.imageChannels, ruleChannelIds)
      : [];
    const videoChannels = answers.generateVideo
      ? resolveQaNodeChannels(answers.videoChannels, ruleChannelIds)
      : [];
    const translationChannels = answers.translate
      ? resolveQaNodeChannels(answers.translationChannels, ruleChannelIds)
      : [];
    const summaryChannels = answers.generateSummary
      ? resolveQaNodeChannels(answers.summaryChannels, ruleChannelIds)
      : [];

    if (answers.generateSummary && !summaryChannels.length) {
      throw new BadRequestException(
        'Select at least one rule channel for summarization',
      );
    }
    if (answers.generateImage && !imageChannels.length) {
      throw new BadRequestException(
        'Select at least one rule channel for image generation',
      );
    }
    if (answers.generateVideo && !videoChannels.length) {
      throw new BadRequestException(
        'Select at least one rule channel for video generation',
      );
    }
    if (answers.translate && !translationChannels.length) {
      throw new BadRequestException(
        'Select at least one rule channel for translation',
      );
    }

    return {
      ...answers,
      summaryChannels,
      imageChannels,
      videoChannels,
      translationChannels,
    };
  }

  private workflowNameFromAnswers(
    additionalMessage: string,
    ruleId: string,
  ): string {
    const trimmed = additionalMessage.trim();
    if (trimmed) {
      return `Workflow: ${trimmed.slice(0, 64)}`;
    }
    return `Workflow for rule ${ruleId.slice(0, 8)}`;
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
          isLocked: n.isLocked,
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

    await this.workflowNodes.deleteByWorkflow(workflowId, auth);
    for (const n of graphNodes) {
      await this.workflowNodes.create({
        workflow: { connect: { workflowId } },
        nodeId: n.nodeId,
        userId,
        type: n.type,
        order: n.order,
        isLocked: n.isLocked,
        userPrompt: n.userPrompt?.trim() ?? '',
        config: n.config as never,
        lane: n.lane ?? undefined,
      });
    }
    return { nodeIds: graphNodes.map((n) => n.nodeId), edges };
  }

  async listTemplates(auth: TenancyAuth) {
    const rows = await this.workflows.listTemplates(auth);
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
    const source = await this.workflows.findById(workflowId, auth);
    if (!source) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    const nodes = await this.workflowNodes.findByWorkflow(workflowId, auth);
    const edges = Array.isArray(source.edges) ? source.edges : [];

    const clone = await this.workflows.create({
      userId: auth.userId,
      ruleRef: source.ruleRef,
      name: name,
      isTemplate: true,
      templateName: name,
      status: WorkflowStatus.Ready,
      nodes: [],
      edges: edges as never,
      versions: [],
    });

    if (nodes.length > 0) {
      const created = await this.workflowNodes.createMany(
        nodes.map((n) => ({
          nodeId: randomUUID(),
          workflowRef: clone.workflowId,
          userId: auth.userId,
          type: n.type,
          order: n.order,
          isLocked: n.isLocked,
          userPrompt: n.userPrompt ?? '',
          config: (n.config ?? {}) as never,
        })),
      );
      await this.workflows.updateById(clone.workflowId, {
        nodes: created.map((n) => n.nodeId),
      });
    }

    return { workflowId: clone.workflowId, templateName: name };
  }

  async applyTemplate(
    templateId: string,
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<{ workflowId: string }> {
    const template = await this.workflows.findById(templateId, auth);
    if (!template?.isTemplate) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    const nodes = await this.workflowNodes.findByWorkflow(templateId, auth);

    const workflow = await this.workflows.create({
      userId: auth.userId,
      ruleRef: ruleId,
      name: `From template: ${template.templateName ?? template.name}`,
      isTemplate: false,
      templateName: null,
      status: WorkflowStatus.Ready,
      nodes: [],
      edges: (Array.isArray(template.edges) ? template.edges : []) as never,
      versions: [],
    });

    if (nodes.length > 0) {
      const created = await this.workflowNodes.createMany(
        nodes.map((n) => ({
          nodeId: randomUUID(),
          workflowRef: workflow.workflowId,
          userId: auth.userId,
          type: n.type,
          order: n.order,
          isLocked: n.isLocked,
          userPrompt: n.userPrompt ?? '',
          config: (n.config ?? {}) as never,
        })),
      );
      await this.workflows.updateById(workflow.workflowId, {
        nodes: created.map((n) => n.nodeId),
      });
    }
    return { workflowId: workflow.workflowId };
  }

  async archiveTemplate(templateId: string, auth: TenancyAuth) {
    const template = await this.workflows.findById(templateId, auth);
    if (!template?.isTemplate) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }
    const doc = await this.workflows.archiveTemplate(templateId);
    if (!doc) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }
    return { success: true };
  }
}
