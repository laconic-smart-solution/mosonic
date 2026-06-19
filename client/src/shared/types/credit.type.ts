export type CreditPackage = {
  id: string
  credits: number
  priceUsd: number
  label: string
}

export type TopupCreditsPayload = {
  packageId: string
}

export type TopupCreditsResponse = {
  creditsRemaining: number
  creditsAdded: number
}
