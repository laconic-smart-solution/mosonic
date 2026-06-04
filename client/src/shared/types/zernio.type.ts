export type ZernioConnectedAccount = {
  channel: string
  accountId: string
  connectedAt: string
}

export type ZernioConnectedAccountsResponse = {
  accounts: ZernioConnectedAccount[]
}

