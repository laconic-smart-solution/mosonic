import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { whatsappService } from "../services/whatsapp.service"

export const whatsappQueryKeys = {
  qr: (phone?: string, size?: number) =>
    ["whatsapp", "qr", phone ?? "default", size ?? 300] as const,
  connectStatus: ["whatsapp", "connect", "status"] as const,
  connectSession: ["whatsapp", "connect", "session"] as const,
}

export const useWhatsAppQrQuery = (args?: {
  phone?: string
  size?: number
  enabled?: boolean
}) => {
  const phone = args?.phone
  const size = args?.size ?? 300
  return useQuery({
    queryKey: whatsappQueryKeys.qr(phone, size),
    queryFn: () => whatsappService.getQrCode({ phone, size }),
    enabled: args?.enabled ?? true,
    retry: false,
  })
}

export const useWhatsAppConnectStartQuery = (args?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: whatsappQueryKeys.connectSession,
    queryFn: () => whatsappService.startConnect(),
    enabled: args?.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  })
}

export const useWhatsAppConnectStatusQuery = (args?: {
  enabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refetchInterval?: number | false | ((query: any) => number | false)
}) => {
  return useQuery({
    queryKey: whatsappQueryKeys.connectStatus,
    queryFn: () => whatsappService.getConnectStatus(),
    enabled: args?.enabled ?? true,
    retry: false,
    refetchInterval: args?.refetchInterval ?? false,
  })
}

export const useWhatsAppDisconnectMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => whatsappService.disconnect(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: whatsappQueryKeys.connectStatus,
        }),
        queryClient.invalidateQueries({
          queryKey: whatsappQueryKeys.connectSession,
        }),
      ])
    },
  })
}
