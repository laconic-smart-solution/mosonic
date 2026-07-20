import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { lineService } from "../services/line.service"

export const lineQueryKeys = {
  qr: (basicId?: string, size?: number) =>
    ["line", "qr", basicId ?? "default", size ?? 300] as const,
  connectStatus: ["line", "connect", "status"] as const,
  connectSession: ["line", "connect", "session"] as const,
}

export const useLineQrQuery = (args?: {
  basicId?: string
  size?: number
  enabled?: boolean
}) => {
  const basicId = args?.basicId
  const size = args?.size ?? 300
  return useQuery({
    queryKey: lineQueryKeys.qr(basicId, size),
    queryFn: () => lineService.getQrCode({ basicId, size }),
    enabled: args?.enabled ?? true,
    retry: false,
  })
}

export const useLineConnectStartQuery = (args?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: lineQueryKeys.connectSession,
    queryFn: () => lineService.startConnect(),
    enabled: args?.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  })
}

export const useLineConnectStatusQuery = (args?: {
  enabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refetchInterval?: number | false | ((query: any) => number | false)
}) => {
  return useQuery({
    queryKey: lineQueryKeys.connectStatus,
    queryFn: () => lineService.getConnectStatus(),
    enabled: args?.enabled ?? true,
    retry: false,
    refetchInterval: args?.refetchInterval ?? false,
  })
}

export const useLineDisconnectMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => lineService.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lineQueryKeys.connectStatus }),
        queryClient.invalidateQueries({ queryKey: lineQueryKeys.connectSession }),
      ])
    },
  })
}
