import apiClient from "@/shared/api/api-client"
import type { PublicPlan } from "@/shared/types/plan.type"

export const planService = {
  listPublicPlans: () =>
    apiClient.get<PublicPlan[]>("/plans").then((response) => response.data),
}
