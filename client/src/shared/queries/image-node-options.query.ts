import { useQuery } from "@tanstack/react-query"

import { imageNodeOptionsService } from "@/shared/services/image-node-options.service"

export const imageNodeOptionsQueryKeys = {
  templates: () => ["nodes", "image", "templates"] as const,
  styles: () => ["nodes", "image", "styles"] as const,
}

export function useImageTemplatesQuery() {
  return useQuery({
    queryKey: imageNodeOptionsQueryKeys.templates(),
    queryFn: () => imageNodeOptionsService.listTemplates(),
    staleTime: 60_000,
  })
}

export function useImageDesignStylesQuery() {
  return useQuery({
    queryKey: imageNodeOptionsQueryKeys.styles(),
    queryFn: () => imageNodeOptionsService.listStyles(),
    staleTime: 60_000,
  })
}
