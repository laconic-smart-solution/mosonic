import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export type AdminImageTemplate = {
  imageTemplateId: string
  key: string
  name: string
  description: string
  prompt: string
  imageUrl: string | null
  isActive: boolean
}

export type AdminImageDesignStyle = {
  imageDesignStyleId: string
  key: string
  name: string
  description: string
  prompt: string
  imageUrl: string | null
  isActive: boolean
}

const TEMPLATES_KEY = ["admin-image-templates"]
const STYLES_KEY = ["admin-image-design-styles"]

export function useAdminImageTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => adminApi.listImageTemplates() as Promise<AdminImageTemplate[]>,
  })
}

export function useAdminImageTemplateCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) => adminApi.createImageTemplate(formData),
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useAdminImageTemplateUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      adminApi.updateImageTemplate(id, formData),
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useAdminImageTemplateDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteImageTemplate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useAdminImageDesignStyles() {
  return useQuery({
    queryKey: STYLES_KEY,
    queryFn: () =>
      adminApi.listImageDesignStyles() as Promise<AdminImageDesignStyle[]>,
  })
}

export function useAdminImageDesignStyleCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) => adminApi.createImageDesignStyle(formData),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STYLES_KEY }),
  })
}

export function useAdminImageDesignStyleUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      adminApi.updateImageDesignStyle(id, formData),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STYLES_KEY }),
  })
}

export function useAdminImageDesignStyleDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteImageDesignStyle(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STYLES_KEY }),
  })
}
