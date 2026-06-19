import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreditCalculationService } from './credit-calculation.service';
import {
  BILLABLE_NODE_CREDIT_DEFAULTS,
  defaultCostUsdForNodeType,
  isBillableNodeCreditType,
  SOCIAL_ACCOUNT_CONNECT_LEGACY_COST_USD,
  SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
} from './lib/billable-node-credit-types';
import {
  NodeCreditPrice,
  type NodeCreditPriceDocument,
} from './schemas/node-credit-price.schema';

export type NodeCreditPriceRow = {
  nodeType: string;
  costUsd: number;
  costCredit: number;
  isActive: boolean;
  updatedAt?: Date;
  creditPriceUsd: number;
  marginTarget: number;
  overheadFactor: number;
};

@Injectable()
export class NodeCreditPriceService {
  constructor(
    @InjectModel(NodeCreditPrice.name)
    private readonly nodeCreditPriceModel: Model<NodeCreditPriceDocument>,
    private readonly calculation: CreditCalculationService,
  ) {}

  async migrateLegacyCostCredit(): Promise<void> {
    const legacy = await this.nodeCreditPriceModel
      .find({
        $or: [{ costUsd: { $exists: false } }, { costUsd: null }],
      })
      .lean<Array<Record<string, unknown>>>()
      .exec();

    for (const doc of legacy) {
      const nodeType = String(doc.nodeType ?? '');
      const defaultUsd = defaultCostUsdForNodeType(nodeType);
      if (defaultUsd == null) continue;
      await this.nodeCreditPriceModel
        .updateOne(
          { nodeType },
          {
            $set: { costUsd: defaultUsd, isActive: true },
            $unset: { costCredit: '' },
          },
        )
        .exec();
    }
  }

  async seedDefaults(): Promise<void> {
    await this.migrateLegacyCostCredit();
    await this.migrateSocialUnlockCost();
    for (const row of BILLABLE_NODE_CREDIT_DEFAULTS) {
      const existing = await this.nodeCreditPriceModel
        .findOne({ nodeType: row.nodeType })
        .exec();
      if (!existing) {
        await this.nodeCreditPriceModel.create({
          nodeType: row.nodeType,
          costUsd: row.costUsd,
          isActive: true,
        });
      }
    }
  }

  /** Lower social unlock cost when the row still uses the legacy default. */
  private async migrateSocialUnlockCost(): Promise<void> {
    const nextDefault = defaultCostUsdForNodeType(SOCIAL_ACCOUNT_CONNECT_NODE_TYPE);
    if (nextDefault == null) return;
    await this.nodeCreditPriceModel
      .updateOne(
        {
          nodeType: SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
          costUsd: SOCIAL_ACCOUNT_CONNECT_LEGACY_COST_USD,
        },
        { $set: { costUsd: nextDefault, isActive: true } },
      )
      .exec();
  }

  private async resolveCostUsd(nodeType: string): Promise<number | null> {
    if (!isBillableNodeCreditType(nodeType)) {
      return null;
    }
    const row = await this.nodeCreditPriceModel
      .findOne({ nodeType, isActive: true })
      .lean<{ costUsd?: number }>()
      .exec();
    if (row?.costUsd != null && row.costUsd > 0) {
      return row.costUsd;
    }
    return defaultCostUsdForNodeType(nodeType);
  }

  private async toAdminRow(
    nodeType: string,
    costUsd: number,
    isActive: boolean,
    updatedAt?: Date,
  ): Promise<NodeCreditPriceRow> {
    const calc = await this.calculation.calculateCredits(costUsd);
    const config = await this.calculation.getConfig();
    return {
      nodeType,
      costUsd,
      costCredit: calc.creditsCharged,
      isActive,
      updatedAt,
      creditPriceUsd: config.creditPriceUsd,
      marginTarget: config.marginTarget,
      overheadFactor: config.overheadFactor,
    };
  }

  async listForAdmin(): Promise<NodeCreditPriceRow[]> {
    await this.seedDefaults();
    const rows = await this.nodeCreditPriceModel
      .find({
        nodeType: { $in: BILLABLE_NODE_CREDIT_DEFAULTS.map((r) => r.nodeType) },
      })
      .sort({ nodeType: 1 })
      .lean<Array<NodeCreditPrice & { updatedAt?: Date }>>()
      .exec();

    const byType = new Map(rows.map((r) => [r.nodeType, r]));

    return Promise.all(
      BILLABLE_NODE_CREDIT_DEFAULTS.map((def) => {
        const stored = byType.get(def.nodeType);
        const costUsd = stored?.costUsd ?? def.costUsd;
        return this.toAdminRow(
          def.nodeType,
          costUsd,
          stored?.isActive ?? true,
          stored?.updatedAt,
        );
      }),
    );
  }

  /** Billable node types: credits from admin costUsd + current credit config. */
  async getActiveCostCredit(nodeType: string): Promise<number | null> {
    const costUsd = await this.resolveCostUsd(nodeType);
    if (costUsd == null) return null;
    const calc = await this.calculation.calculateCredits(costUsd);
    return calc.creditsCharged;
  }

  async getActiveCostUsd(nodeType: string): Promise<number | null> {
    return this.resolveCostUsd(nodeType);
  }

  async update(nodeType: string, costUsd: number): Promise<NodeCreditPriceRow> {
    if (!isBillableNodeCreditType(nodeType)) {
      throw new BadRequestException(`Unsupported node type: ${nodeType}`);
    }
    const row = await this.nodeCreditPriceModel
      .findOneAndUpdate(
        { nodeType },
        { $set: { costUsd, isActive: true }, $unset: { costCredit: '' } },
        { new: true, upsert: true },
      )
      .lean<NodeCreditPrice & { updatedAt?: Date }>()
      .exec();
    if (!row) {
      throw new NotFoundException(`Node credit price for ${nodeType} not found`);
    }
    return this.toAdminRow(row.nodeType, row.costUsd, row.isActive, row.updatedAt);
  }
}
