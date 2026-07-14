import { Injectable } from '@nestjs/common';
import { PaymentClientService } from './payment-client.service';
import type { TopupPlanRecord } from './payment.types';

export type CreditPackage = {
  id: string;
  credits: number;
  priceUsd: number;
  priceThb: number;
  label: string;
};

@Injectable()
export class PaymentService {
  constructor(private readonly client: PaymentClientService) {}

  async listTopupPlans(params: {
    activeOnly: boolean;
    createdBy?: string;
  }): Promise<TopupPlanRecord[]> {
    const query = params.activeOnly ? '?activeOnly=true' : '?activeOnly=false';
    return this.client.get<TopupPlanRecord[]>(
      `/api/v1/topup-plans${query}`,
      params.createdBy,
    );
  }

  async getTopupPlan(code: string): Promise<TopupPlanRecord | null> {
    return this.client.getOptional<TopupPlanRecord>(
      `/api/v1/topup-plans/${encodeURIComponent(code)}`,
    );
  }

  async createTopupPlan(
    body: {
      code: string;
      label: string;
      credits: number;
      priceUsd: number;
      priceThb: number;
      sortOrder: number;
      active: boolean;
    },
    createdBy?: string,
  ): Promise<TopupPlanRecord> {
    return this.client.postJson<TopupPlanRecord>(
      '/api/v1/topup-plans',
      body,
      createdBy,
    );
  }

  async updateTopupPlan(
    code: string,
    body: {
      label: string;
      credits: number;
      priceUsd: number;
      priceThb: number;
      sortOrder: number;
      active: boolean;
    },
    createdBy?: string,
  ): Promise<TopupPlanRecord> {
    return this.client.putJson<TopupPlanRecord>(
      `/api/v1/topup-plans/${encodeURIComponent(code)}`,
      body,
      createdBy,
    );
  }

  async setTopupPlanActive(
    code: string,
    active: boolean,
    createdBy?: string,
  ): Promise<TopupPlanRecord> {
    return this.client.patchJson<TopupPlanRecord>(
      `/api/v1/topup-plans/${encodeURIComponent(code)}/active`,
      { active },
      createdBy,
    );
  }

  /**
   * Create a Payni hosted checkout via the Java payment service.
   * Payni credentials live on the payment service, not Nest.
   */
  async createRedirectPayment(args: {
    amount: number;
    currencyCode?: string;
  }): Promise<{ transactionId: string; redirectUrl: string }> {
    const body: { amount: number; currencyCode?: string } = {
      amount: args.amount,
    };
    if (args.currencyCode?.trim()) {
      body.currencyCode = args.currencyCode.trim();
    }
    return this.client.postJson<{ transactionId: string; redirectUrl: string }>(
      '/api/v1/payments/redirect',
      body,
    );
  }

  toCreditPackage(plan: TopupPlanRecord): CreditPackage {
    return {
      id: plan.code,
      credits: plan.credits,
      priceUsd: Number(plan.priceUsd),
      priceThb: Number(plan.priceThb),
      label: plan.label,
    };
  }
}
