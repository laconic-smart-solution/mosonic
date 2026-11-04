import { Injectable } from '@nestjs/common';
import type { Prisma, WorkflowNodeType } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type { WorkflowNodeRecord } from '../../domain/workflow/workflow.types';
import {
  hydrateTypedWorkflowNode,
  TYPED_CONFIG_INCLUDE,
  typedColumnsFromConfig,
  typedFamilyForType,
} from '../../nodes/node-typed-config.util';
import {
  isTypedVideoNodeType,
  typedVideoColumnsFromConfig,
} from '../../nodes/video-node-typed-config.util';
import type {
  IWorkflowNodeRepository,
  WorkflowNodeQueryOptions,
} from '../interfaces/workflow-node.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

const VIDEO_NODE_TYPE_VALUES: WorkflowNodeType[] = [
  'video_presenter',
  'video_cinematic',
  'video_generation',
];

/**
 * Every typed config relation rides along on every read
 * (see node-typed-config.util / video-node-typed-config.util).
 */
const WITH_VIDEO_CONFIG = TYPED_CONFIG_INCLUDE;

type NodeWithTypedConfig = Parameters<typeof hydrateTypedWorkflowNode>[0];

function hydrate(node: NodeWithTypedConfig): WorkflowNodeRecord {
  return hydrateTypedWorkflowNode(node) as unknown as WorkflowNodeRecord;
}

type SyncableNode = {
  nodeId: string;
  type: unknown;
  config: unknown;
  userId?: string | null;
};

@Injectable()
export class PrismaWorkflowNodeRepository implements IWorkflowNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByWorkflow(
    workflowRef: string,
    auth?: TenancyAuth,
    opts?: WorkflowNodeQueryOptions,
  ): Promise<WorkflowNodeRecord[]> {
    const base = opts?.templateOnly
      ? { workflowRef, isGenerateMoreOnly: false }
      : { workflowRef };
    const where = auth ? mergeTenancyWhere(base, auth) : base;
    const rows = await this.prisma.workflowNode.findMany({
      where,
      orderBy: { order: 'asc' },
      include: WITH_VIDEO_CONFIG,
    });
    return rows.map(hydrate);
  }

  async findByWorkflowRefs(
    workflowRefs: string[],
    auth?: TenancyAuth,
    opts?: WorkflowNodeQueryOptions,
  ): Promise<WorkflowNodeRecord[]> {
    const base = opts?.templateOnly
      ? { workflowRef: { in: workflowRefs }, isGenerateMoreOnly: false }
      : { workflowRef: { in: workflowRefs } };
    const where = auth ? mergeTenancyWhere(base, auth) : base;
    const rows = await this.prisma.workflowNode.findMany({
      where,
      include: WITH_VIDEO_CONFIG,
    });
    return rows.map(hydrate);
  }

  async findByWorkflowAndNodeId(
    workflowRef: string,
    nodeId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord | null> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef, nodeId }, auth)
      : { workflowRef, nodeId };
    const row = await this.prisma.workflowNode.findFirst({
      where,
      include: WITH_VIDEO_CONFIG,
    });
    return row ? hydrate(row) : null;
  }

  /** Presenter, cinematic, or legacy video node. */
  async findVideoNode(
    workflowRef: string,
    nodeId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord | null> {
    const where = auth
      ? mergeTenancyWhere(
          { workflowRef, nodeId, type: { in: VIDEO_NODE_TYPE_VALUES } },
          auth,
        )
      : { workflowRef, nodeId, type: { in: VIDEO_NODE_TYPE_VALUES } };
    const row = await this.prisma.workflowNode.findFirst({
      where,
      include: WITH_VIDEO_CONFIG,
    });
    return row ? hydrate(row) : null;
  }

  countByWorkflow(workflowRef: string, auth?: TenancyAuth): Promise<number> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef }, auth)
      : { workflowRef };
    return this.prisma.workflowNode.count({ where });
  }

  async distinctWorkflowRefsByType(
    type: WorkflowNodeType,
    auth?: TenancyAuth,
  ): Promise<string[]> {
    const where = auth ? mergeTenancyWhere({ type }, auth) : { type };
    const rows = await this.prisma.workflowNode.findMany({
      where,
      select: { workflowRef: true },
      distinct: ['workflowRef'],
    });
    return rows.map((r) => r.workflowRef);
  }

  async create(data: Prisma.WorkflowNodeCreateInput): Promise<WorkflowNodeRecord> {
    const created = await this.prisma.workflowNode.create({ data });
    await this.syncTypedConfig(created);
    return created;
  }

  async createMany(
    data: Prisma.WorkflowNodeCreateManyInput[],
  ): Promise<WorkflowNodeRecord[]> {
    await this.prisma.workflowNode.createMany({ data });
    if (data.length === 0) return [];
    const created = await this.prisma.workflowNode.findMany({
      where: {
        workflowRef: data[0].workflowRef,
        nodeId: { in: data.map((d) => d.nodeId).filter(Boolean) as string[] },
      },
    });
    for (const node of created) await this.syncTypedConfig(node);
    return created;
  }

  async upsertNode(
    workflowRef: string,
    nodeId: string,
    data: Prisma.WorkflowNodeCreateInput,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord> {
    const existing = await this.findByWorkflowAndNodeId(
      workflowRef,
      nodeId,
      auth,
    );
    const saved = existing
      ? await this.prisma.workflowNode.update({
          where: { nodeId },
          data: {
            type: data.type,
            order: data.order,
            isLocked: data.isLocked,
            userPrompt: data.userPrompt,
            config: data.config,
            lane: data.lane,
            x: data.x,
            y: data.y,
            userId: data.userId,
          },
        })
      : await this.prisma.workflowNode.create({ data });
    await this.syncTypedConfig(saved, existing?.type);
    return saved;
  }

  async updateConfig(
    workflowRef: string,
    nodeId: string,
    config: Prisma.InputJsonValue,
    auth?: TenancyAuth,
  ): Promise<void> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef, nodeId }, auth)
      : { workflowRef, nodeId };
    const result = await this.prisma.workflowNode.updateMany({
      where,
      data: { config },
    });
    if (!result?.count) return;
    const node = await this.prisma.workflowNode.findFirst({
      where,
      select: { nodeId: true, type: true, config: true, userId: true },
    });
    if (node) await this.syncTypedConfig(node);
  }

  deleteExcept(
    workflowRef: string,
    keepNodeIds: string[],
    auth?: TenancyAuth,
  ): Promise<void> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef, nodeId: { notIn: keepNodeIds } }, auth)
      : { workflowRef, nodeId: { notIn: keepNodeIds } };
    return this.prisma.workflowNode.deleteMany({ where }).then(() => undefined);
  }

  deleteByWorkflow(
    workflowRef: string,
    auth?: TenancyAuth,
    opts?: WorkflowNodeQueryOptions,
  ): Promise<void> {
    const base = opts?.templateOnly
      ? { workflowRef, isGenerateMoreOnly: false }
      : { workflowRef };
    const where = auth ? mergeTenancyWhere(base, auth) : base;
    return this.prisma.workflowNode.deleteMany({ where }).then(() => undefined);
  }

  /** Dual-write every typed config table for this node (video + families). */
  private async syncTypedConfig(
    node: SyncableNode,
    previousType?: unknown,
  ): Promise<void> {
    await this.syncVideoConfig(node);
    await this.syncFamilyConfig(node, previousType);
  }

  /**
   * Dual-write: mirror the saved config JSON into the node's family table
   * (text / translation / image / media / branch). When the node type changed
   * to another family, drop the stale typed row from the previous family.
   */
  private async syncFamilyConfig(
    node: SyncableNode,
    previousType?: unknown,
  ): Promise<void> {
    const family = typedFamilyForType(node.type);
    const prevFamily =
      previousType !== undefined ? typedFamilyForType(previousType) : null;
    if (prevFamily && prevFamily !== family) {
      const prevTable = this.familyTable(prevFamily.delegate);
      if (prevTable) {
        await prevTable.deleteMany({ where: { nodeId: node.nodeId } });
      }
    }
    if (!family) return;
    const table = this.familyTable(family.delegate);
    if (!table) return;
    const data = typedColumnsFromConfig(family, node.config);
    await table.upsert({
      where: { nodeId: node.nodeId },
      create: { nodeId: node.nodeId, ...data },
      update: data,
    });
  }

  private familyTable(delegate: string):
    | {
        upsert: (args: unknown) => Promise<unknown>;
        deleteMany: (args: unknown) => Promise<unknown>;
      }
    | undefined {
    return (this.prisma as unknown as Record<string, never>)[delegate];
  }

  /**
   * Dual-write: mirror the saved config JSON into `workflow_video_node_configs`
   * for presenter / cinematic nodes; drop the typed row if the type changed.
   * Look FK is set only when the look is one of the node owner's avatars
   * (stock HeyGen looks stay as plain `heygenAvatarId`).
   */
  private async syncVideoConfig(node: SyncableNode): Promise<void> {

    const table = this.prisma.workflowVideoNodeConfig;
    if (!table) return;
    if (!isTypedVideoNodeType(node.type)) {
      await table.deleteMany({ where: { nodeId: node.nodeId } });
      return;
    }
    const { sourceRuleAssetId: requestedAsset, ...cols } =
      typedVideoColumnsFromConfig(node.config);

    let userAvatarLookId: string | null = null;
    if (cols.heygenAvatarId) {
      const look = await this.prisma.heygenUserAvatar.findUnique({
        where: { lookId: cols.heygenAvatarId },
        select: { lookId: true, userId: true },
      });
      if (look && (!node.userId || look.userId === node.userId)) {
        userAvatarLookId = look.lookId;
      }
    }

    let sourceRuleAssetId: string | null = null;
    if (requestedAsset) {
      const asset = await this.prisma.ruleAsset.findUnique({
        where: { ruleAssetId: requestedAsset },
        select: { ruleAssetId: true },
      });
      sourceRuleAssetId = asset?.ruleAssetId ?? null;
    }

    const data = { ...cols, userAvatarLookId, sourceRuleAssetId };
    await table.upsert({
      where: { nodeId: node.nodeId },
      create: { nodeId: node.nodeId, ...data },
      update: data,
    });
  }
}
