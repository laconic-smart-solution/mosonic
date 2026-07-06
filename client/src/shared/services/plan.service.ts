import apiClient from "@/shared/api/api-client"
import type { InitiatePlanUpgradeResponse, PublicPlan } from "@/shared/types/plan.type"

export const planService = {
  listPublicPlans: () =>
    apiClient.get<PublicPlan[]>("/plans").then((response) => response.data),

  initiatePlanUpgrade: (planId: string) =>
    apiClient
      .post<InitiatePlanUpgradeResponse>("/plans/upgrade/initiate", { planId })
      .then((response) => response.data),
}
