import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { INodeCreditPriceRepository } from '../repositories/interfaces/node-credit-price.repository.interface';
import { NODE_CREDIT_PRICE_REPOSITORY } from '../repositories/tokens';
import { CreditCalculationService } from './credit-calculation.service';
import {
  BILLABLE_NODE_CREDIT_DEFAULTS,
  defaultCostUsdForNodeType,
  isBillableNodeCreditType,
  LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
  SOCIAL_ACCOUNT_CONNECT_LEGACY_COST_USD,
  SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
  VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
} from './lib/billable-node-credit-types';

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
    @Inject(NODE_CREDIT_PRICE_REPOSITORY)
    private readonly nodeCreditPrices: INodeCreditPriceRepository,
    private readonly calculation: CreditCalculationService,
  ) {}

  async migrateLegacyCostCredit(): Promise<void> {
    const legacy = await this.nodeCreditPrices.findLegacyMissingCostUsd();
    for (const doc of legacy) {
      const nodeType = String(doc.nodeType ?? '');
      const defaultUsd = defaultCostUsdForNodeType(nodeType);
      if (defaultUsd == null) continue;
      await this.nodeCreditPrices.migrateLegacyRow(nodeType, defaultUsd);
    }
  }

  async seedDefaults(): Promise<void> {
    await this.migrateLegacyCostCredit();
    await this.migrateSocialUnlockCost();
    await this.migrateVideoGenerationCreditSplit();
    for (const row of BILLABLE_NODE_CREDIT_DEFAULTS) {
      const existing = await this.nodeCreditPrices.findByNodeType(row.nodeType);
      if (!existing) {
        await this.nodeCreditPrices.create({
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
    await this.nodeCreditPrices.updateSocialUnlockLegacy(
      SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      SOCIAL_ACCOUNT_CONNECT_LEGACY_COST_USD,
      nextDefault,
    );
  }

  /**
   * Split legacy `video_generation` pricing into presenter + cinematic rows.
   * Existing admin price becomes presenter; cinematic seeds from defaults.
   */
  private async migrateVideoGenerationCreditSplit(): Promise<void> {
    const legacy = await this.nodeCreditPrices.findByNodeType(
      LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
    );
    const presenterExisting = await this.nodeCreditPrices.findByNodeType(
      VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
    );

    if (legacy && !presenterExisting) {
      await this.nodeCreditPrices.create({
        nodeType: VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
        costUsd: legacy.costUsd,
        isActive: legacy.isActive,
      });
    }

    if (legacy?.isActive) {
      await this.nodeCreditPrices.setActiveByNodeType(
        LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
        false,
      );
    }
  }

  private async resolveCostUsd(nodeType: string): Promise<number | null> {
    if (!isBillableNodeCreditType(nodeType)) {
      return null;
    }
    const row = await this.nodeCreditPrices.findActiveByNodeType(nodeType);
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
    const nodeTypes = BILLABLE_NODE_CREDIT_DEFAULTS.map((r) => r.nodeType);
    const rows = await this.nodeCreditPrices.listByNodeTypes(nodeTypes);
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
    const row = await this.nodeCreditPrices.upsertByNodeType(nodeType, costUsd);
    return this.toAdminRow(row.nodeType, row.costUsd, row.isActive, row.updatedAt);
  }
}
