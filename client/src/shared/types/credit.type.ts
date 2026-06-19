export type CreditPackage = {
  id: string
  credits: number
  priceUsd: number
  priceThb: number
  label: string
}

export type TopupCreditsPayload = {
  packageId: string
}

export type PayniTopupResponse = {
  redirectUrl: string
  transactionId: string
}

export type InitiateTopupResponse = {
  topupPurchaseId?: string
  payniResponse?: PayniTopupResponse
  instant?: {
    creditsRemaining: number
    creditsAdded: number
  }
}

/** @deprecated Instant mock response — use InitiateTopupResponse */
export type TopupCreditsResponse = {
  creditsRemaining: number
  creditsAdded: number
}
