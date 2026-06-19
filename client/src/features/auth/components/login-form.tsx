import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import FormInputText from "@/components/common/form/form-input-text"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { login, me } from "@/features/admin/api/auth-api"
import { setAuthFormApiError } from "@/features/auth/api/auth-flow-api"
import { AuthFormRootError } from "@/features/auth/components/auth-form-root-error"
import { mapLocalUserToUser } from "@/shared/lib/map-local-user"
import {
  createLoginSchema,
  type LoginFormValues,
} from "@/shared/schemas/auth.schema"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

export function LoginForm() {
  const { t } = useTranslation("auth")
  const { t: tv } = useTranslation("validation")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useUserStore((s) => s.setUser)

  const next = searchParams.get("next")?.trim() || "/dashboard"

  const loginSchema = useMemo(() => createLoginSchema(tv), [tv])

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: LoginFormValues) => {
      const res = await login({
        username: values.username.trim(),
        password: values.password,
      })
      if (!res.accessToken || !res.refreshToken) {
        throw new Error(t("signIn.tokenMissing"))
      }
      setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken })

      const meResp = await me()
      const role = meResp?.auth?.localUser?.role ?? null
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: role ?? undefined,
      })

      const lu = meResp?.auth?.localUser
      if (lu && typeof lu === "object") {
        setUser(mapLocalUserToUser(lu as Parameters<typeof mapLocalUserToUser>[0]))
      }
    },
    onSuccess: () => {
      toast.success(t("signIn.loggedIn"))
      navigate(next, { replace: true })
    },
    onError: (err: unknown) => {
      setAuthFormApiError(form.setError, err, t("signIn.failed"))
    },
  })

  const onSubmit = (values: LoginFormValues) => {
    form.clearErrors("root")
    mutation.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormInputText
          form={form}
          name="username"
          label={t("signIn.username")}
          autoComplete="username"
          required
        />
        <FormInputText
          form={form}
          name="password"
          type="password"
          label={t("signIn.password")}
          autoComplete="current-password"
          required
        />

        <AuthFormRootError message={form.formState.errors.root?.message} />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("signIn.submitting") : t("signIn.submit")}
        </Button>
      </form>
    </Form>
  )
}
