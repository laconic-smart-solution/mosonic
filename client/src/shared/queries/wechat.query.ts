import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { wechatService } from "../services/wechat.service"

export const wechatQueryKeys = {
  qr: (sceneStr?: string, size?: number) =>
    ["wechat", "qr", sceneStr ?? "default", size ?? 300] as const,
  connectStatus: ["wechat", "connect", "status"] as const,
  connectSession: ["wechat", "connect", "session"] as const,
}

export const useWechatQrQuery = (args?: {
  sceneStr?: string
  size?: number
  enabled?: boolean
}) => {
  const sceneStr = args?.sceneStr
  const size = args?.size ?? 300
  return useQuery({
    queryKey: wechatQueryKeys.qr(sceneStr, size),
    queryFn: () => wechatService.getQrCode({ sceneStr, size }),
    enabled: args?.enabled ?? true,
    retry: false,
  })
}

export const useWechatConnectStartQuery = (args?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: wechatQueryKeys.connectSession,
    queryFn: () => wechatService.startConnect(),
    enabled: args?.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  })
}

export const useWechatConnectStatusQuery = (args?: {
  enabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refetchInterval?: number | false | ((query: any) => number | false)
}) => {
  return useQuery({
    queryKey: wechatQueryKeys.connectStatus,
    queryFn: () => wechatService.getConnectStatus(),
    enabled: args?.enabled ?? true,
    retry: false,
    refetchInterval: args?.refetchInterval ?? false,
  })
}

export const useWechatDisconnectMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => wechatService.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wechatQueryKeys.connectStatus }),
        queryClient.invalidateQueries({
          queryKey: wechatQueryKeys.connectSession,
        }),
      ])
    },
  })
}
