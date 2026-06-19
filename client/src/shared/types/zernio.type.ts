export type ZernioConnectedAccount = {
  userId: string
  channel: string
  accountId: string
  connectedAt: string
}

export type ZernioConnectedAccountsResponse = {
  accounts: ZernioConnectedAccount[]
}

export type ZernioConnectionCreditResponse = {
  nodeType: string
  creditsEach: number
  creditsRemaining: number
}

