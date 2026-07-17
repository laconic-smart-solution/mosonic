import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { viberService } from "../services/viber.service"

export const viberQueryKeys = {
  qr: (uri?: string, size?: number) =>
    ["viber", "qr", uri ?? "default", size ?? 300] as const,
  connectStatus: ["viber", "connect", "status"] as const,
  connectSession: ["viber", "connect", "session"] as const,
}

export const useViberQrQuery = (args?: {
  uri?: string
  size?: number
  enabled?: boolean
}) => {
  const uri = args?.uri
  const size = args?.size ?? 300
  return useQuery({
    queryKey: viberQueryKeys.qr(uri, size),
    queryFn: () => viberService.getQrCode({ uri, size }),
    enabled: args?.enabled ?? true,
    retry: false,
  })
}

export const useViberConnectStartQuery = (args?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: viberQueryKeys.connectSession,
    queryFn: () => viberService.startConnect(),
    enabled: args?.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  })
}

export const useViberConnectStatusQuery = (args?: {
  enabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refetchInterval?: number | false | ((query: any) => number | false)
}) => {
  return useQuery({
    queryKey: viberQueryKeys.connectStatus,
    queryFn: () => viberService.getConnectStatus(),
    enabled: args?.enabled ?? true,
    retry: false,
    refetchInterval: args?.refetchInterval ?? false,
  })
}

export const useViberDisconnectMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => viberService.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: viberQueryKeys.connectStatus,
        }),
        queryClient.invalidateQueries({
          queryKey: viberQueryKeys.connectSession,
        }),
      ])
    },
  })
}
