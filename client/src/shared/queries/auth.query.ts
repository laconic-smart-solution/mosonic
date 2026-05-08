import { useMutation } from "@tanstack/react-query"

import { authService } from "../services/auth.service"

export function useRefreshMutation() {
  return useMutation({
    mutationFn: () => authService.refresh(),
  })
}
