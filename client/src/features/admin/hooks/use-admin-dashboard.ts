import { useQuery } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminOverview = () =>
  useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => adminApi.getOverview(),
    staleTime: 30_000,
  })

export const useAdminUserGrowth = (days = 30) =>
  useQuery({
    queryKey: ["admin-user-growth", days],
    queryFn: () => adminApi.getUserGrowth(days),
    staleTime: 60_000,
  })

export const useAdminPipelineTrend = (days = 30) =>
  useQuery({
    queryKey: ["admin-pipeline-trend", days],
    queryFn: () => adminApi.getPipelineTrend(days),
    staleTime: 60_000,
  })

export const useAdminCostTrend = (days = 30) =>
  useQuery({
    queryKey: ["admin-cost-trend", days],
    queryFn: () => adminApi.getCostTrend(days),
    staleTime: 60_000,
  })

export const useAdminNodeTypes = () =>
  useQuery({
    queryKey: ["admin-node-types"],
    queryFn: () => adminApi.getNodeTypes(),
    staleTime: 60_000,
  })

export const useAdminChannels = () =>
  useQuery({
    queryKey: ["admin-channels"],
    queryFn: () => adminApi.getChannels(),
    staleTime: 60_000,
  })
