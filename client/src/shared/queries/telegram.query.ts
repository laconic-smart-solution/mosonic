import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { telegramService } from "../services/telegram.service"

export const telegramQueryKeys = {
  qr: (botUsername?: string, size?: number) =>
    ["telegram", "qr", botUsername ?? "default", size ?? 300] as const,
  connectStatus: ["telegram", "connect", "status"] as const,
  connectSession: ["telegram", "connect", "session"] as const,
}

export const useTelegramQrQuery = (args?: {
  botUsername?: string
  size?: number
  enabled?: boolean
}) => {
  const botUsername = args?.botUsername
  const size = args?.size ?? 300
  return useQuery({
    queryKey: telegramQueryKeys.qr(botUsername, size),
    queryFn: () => telegramService.getQrCode({ botUsername, size }),
    enabled: args?.enabled ?? true,
    retry: false,
  })
}

export const useTelegramConnectStartQuery = (args?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: telegramQueryKeys.connectSession,
    queryFn: () => telegramService.startConnect(),
    enabled: args?.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  })
}

export const useTelegramConnectStatusQuery = (args?: {
  enabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refetchInterval?: number | false | ((query: any) => number | false)
}) => {
  return useQuery({
    queryKey: telegramQueryKeys.connectStatus,
    queryFn: () => telegramService.getConnectStatus(),
    enabled: args?.enabled ?? true,
    retry: false,
    refetchInterval: args?.refetchInterval ?? false,
  })
}

export const useTelegramDisconnectMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => telegramService.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramQueryKeys.connectStatus,
        }),
        queryClient.invalidateQueries({
          queryKey: telegramQueryKeys.connectSession,
        }),
      ])
    },
  })
}
