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
  unlockedChannels?: string[]
}

export type ZernioUnlockChannelResponse = {
  unlocked: true
  alreadyUnlocked: boolean
}

export type ZernioConnectChannelResponse = {
  connectUrl: string
}

export type ZernioConnectionCreditResponse = {
  nodeType: string
  creditsEach: number
  creditsRemaining: number
}

