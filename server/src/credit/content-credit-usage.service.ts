import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import {
  CreditLedger,
  type CreditLedgerDocument,
} from './schemas/credit-ledger.schema';

export type ContentCreditUsage = {
  totalCredits: number;
  byNodeId: Record<string, number>;
};

type PipelineNodeRef = {
  nodeId: string;
  type: string;
  status?: string;
};

type LedgerLean = {
  nodeId: string;
  nodeType: string;
  pipelineRef: string;
  contentRef?: string;
  creditsCharged: number;
};

@Injectable()
export class ContentCreditUsageService {
  constructor(
    @InjectModel(CreditLedger.name)
    private readonly ledgerModel: Model<CreditLedgerDocument>,
  ) {}

  async getTotalsForContents(
    userId: string,
    items: Array<{ contentId: string; pipelineRef: string }>,
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (items.length === 0) return totals;

    const contentIds = items.map((i) => i.contentId);
    const pipelineRefs = [...new Set(items.map((i) => i.pipelineRef))];
    const pipelineToContent = new Map(
      items.map((i) => [i.pipelineRef, i.contentId]),
    );

    const entries = (await this.ledgerModel
      .find({
        userId,
        $or: [
          { contentRef: { $in: contentIds } },
          { pipelineRef: { $in: pipelineRefs } },
        ],
      })
      .select('contentRef pipelineRef creditsCharged')
      .lean()
      .exec()) as LedgerLean[];

    for (const entry of entries) {
      const contentId =
        entry.contentRef ?? pipelineToContent.get(entry.pipelineRef);
      if (!contentId) continue;
      totals.set(
        contentId,
        (totals.get(contentId) ?? 0) + entry.creditsCharged,
      );
    }

    return totals;
  }

  async getUsageForContent(
    userId: string,
    contentId: string,
    pipelineRef: string,
    pipelineNodes: PipelineNodeRef[],
  ): Promise<ContentCreditUsage> {
    const entries = (await this.ledgerModel
      .find({
        userId,
        $or: [{ contentRef: contentId }, { pipelineRef }],
      })
      .select('nodeId nodeType pipelineRef contentRef creditsCharged')
      .lean()
      .exec()) as LedgerLean[];

    return this.buildUsageFromEntries(
      contentId,
      pipelineRef,
      pipelineNodes,
      entries,
    );
  }

  buildUsageFromEntries(
    contentId: string,
    pipelineRef: string,
    pipelineNodes: PipelineNodeRef[],
    entries: LedgerLean[],
  ): ContentCreditUsage {
    const directByNodeId = new Map<string, number>();
    const netByType = new Map<string, number>();
    const pipelineTypePrefix = `${pipelineRef}:`;

    for (const entry of entries) {
      const { nodeId, nodeType, creditsCharged } = entry;
      const isPipelineScoped =
        !entry.contentRef && entry.pipelineRef === pipelineRef;

      if (isPipelineScoped && nodeId.startsWith(pipelineTypePrefix)) {
        const suffix = nodeId.slice(pipelineTypePrefix.length);
        if (!suffix.includes('-')) {
          netByType.set(
            nodeType,
            (netByType.get(nodeType) ?? 0) + creditsCharged,
          );
          continue;
        }
      }

      const baseNodeId = nodeId.endsWith(':refund')
        ? nodeId.slice(0, -':refund'.length)
        : nodeId;
      if (
        entry.contentRef === contentId ||
        pipelineNodes.some((n) => n.nodeId === baseNodeId)
      ) {
        directByNodeId.set(
          baseNodeId,
          (directByNodeId.get(baseNodeId) ?? 0) + creditsCharged,
        );
      }
    }

    const byNodeId: Record<string, number> = {};
    let totalCredits = 0;

    for (const [nodeId, credits] of directByNodeId) {
      if (credits === 0) continue;
      byNodeId[nodeId] = credits;
      totalCredits += credits;
    }

    const nodesByType = new Map<string, PipelineNodeRef[]>();
    for (const node of pipelineNodes) {
      const list = nodesByType.get(node.type) ?? [];
      list.push(node);
      nodesByType.set(node.type, list);
    }

    for (const [nodeType, netCredits] of netByType) {
      if (netCredits === 0) continue;
      const nodes = nodesByType.get(nodeType) ?? [];
      const chargeable = nodes.filter(
        (n) =>
          !n.status || n.status === PipelineNodeExecutionStatus.Completed,
      );
      const targets = chargeable.length > 0 ? chargeable : nodes;
      if (targets.length === 0) continue;

      const each = netCredits / targets.length;
      let allocated = 0;
      for (let i = 0; i < targets.length; i++) {
        const node = targets[i]!;
        const slice =
          i === targets.length - 1
            ? netCredits - allocated
            : Math.round(each * 100) / 100;
        allocated += slice;
        const prev = byNodeId[node.nodeId] ?? 0;
        byNodeId[node.nodeId] = Math.round((prev + slice) * 100) / 100;
      }
      totalCredits += netCredits;
    }

    totalCredits = Math.round(totalCredits * 100) / 100;

    return { totalCredits, byNodeId };
  }
}
