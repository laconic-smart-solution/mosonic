import apiClient from "@/shared/api/api-client"
import type {
  CreditPackage,
  TopupCreditsPayload,
  TopupCreditsResponse,
} from "@/shared/types/credit.type"

export const creditService = {
  getPackages: () =>
    apiClient.get<CreditPackage[]>("/credit/packages").then((r) => r.data),

  topup: (payload: TopupCreditsPayload) =>
    apiClient
      .post<TopupCreditsResponse>("/credit/topup", payload)
      .then((r) => r.data),
}
