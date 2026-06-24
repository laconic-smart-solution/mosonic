import { getSharedSocket } from "./socket-client"

export type CreditLowBalancePayload = {
  userId: string
  creditsRemaining: number
  creditsPerMonth: number
  percentRemaining: number
}

export type CreditBalanceUpdatedPayload = {
  userId: string
  creditsRemaining: number
  creditsUsed: number
  creditsPerMonth: number
}

export function onCreditLowBalance(
  handler: (payload: CreditLowBalancePayload) => void,
): () => void {
  const socket = getSharedSocket()
  socket.on("credit:low_balance", handler)
  return () => socket.off("credit:low_balance", handler)
}

export function onCreditBalanceUpdated(
  handler: (payload: CreditBalanceUpdatedPayload) => void,
): () => void {
  const socket = getSharedSocket()
  socket.on("credit:balance_updated", handler)
  return () => socket.off("credit:balance_updated", handler)
}
