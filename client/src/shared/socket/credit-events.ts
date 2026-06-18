import { getSharedSocket } from "./socket-client"

export type CreditLowBalancePayload = {
  userId: string
  creditsRemaining: number
  creditsPerMonth: number
  percentRemaining: number
}

export function onCreditLowBalance(
  handler: (payload: CreditLowBalancePayload) => void,
): () => void {
  const socket = getSharedSocket()
  socket.on("credit:low_balance", handler)
  return () => socket.off("credit:low_balance", handler)
}
