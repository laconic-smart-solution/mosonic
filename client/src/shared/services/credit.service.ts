import apiClient from "@/shared/api/api-client"
import type {
  CreditPackage,
  InitiateTopupResponse,
  TopupCreditsPayload,
} from "@/shared/types/credit.type"

export const creditService = {
  getPackages: () =>
    apiClient.get<CreditPackage[]>("/credit/packages").then((r) => r.data),

  initiateTopup: (payload: TopupCreditsPayload) =>
    apiClient
      .post<InitiateTopupResponse>("/credit/topup/initiate", payload)
      .then((r) => r.data),
}
