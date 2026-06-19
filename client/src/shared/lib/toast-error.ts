import { toast } from "sonner"

import { getToastErrorMessage } from "./api-error"

export function toastApiError(
  err: unknown,
  fallbackKey: string,
  options?: { id?: string },
): void {
  const message = getToastErrorMessage(err, fallbackKey)
  toast.error(message, options?.id ? { id: options.id } : undefined)
}

export function toastMutationError(
  err: unknown,
  namespace: string,
  key: string,
  options?: { id?: string },
): void {
  toastApiError(err, `${namespace}:${key}`, options)
}
