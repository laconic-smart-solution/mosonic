export type ZernioConnectedAccount = {
  userId: string
  channel: string
  accountId: string
  connectedAt: string
  displayName?: string | null
  username?: string | null
}

export type ZernioConnectedAccountsResponse = {
  accounts: ZernioConnectedAccount[]
}

export type ZernioConnectChannelResponse = {
  connectUrl: string
}

