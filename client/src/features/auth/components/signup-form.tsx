import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import FormInputText from "@/components/common/form/form-input-text"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { setAuthFormApiError, signup } from "@/features/auth/api/auth-flow-api"
import { AuthFormRootError } from "@/features/auth/components/auth-form-root-error"
import {
  createSignupSchema,
  type SignupFormValues,
} from "@/shared/schemas/auth.schema"

export function SignupForm() {
  const { t } = useTranslation("auth")
  const { t: tv } = useTranslation("validation")
  const navigate = useNavigate()

  const signupSchema = useMemo(() => createSignupSchema(tv), [tv])

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      phoneNumber: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: SignupFormValues) => {
      const email = values.email.trim()
      await signup({
        email,
        username: values.username.trim(),
        password: values.password,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        ...(values.phoneNumber?.trim()
          ? { phoneNumber: values.phoneNumber.trim() }
          : {}),
      })
      return email
    },
    onSuccess: (email) => {
      toast.success(t("signUp.success"))
      navigate(`/verify-otp?email=${encodeURIComponent(email)}`, { replace: true })
    },
    onError: (err: unknown) => {
      setAuthFormApiError(form.setError, err, t("signUp.failed"))
    },
  })

  const onSubmit = (values: SignupFormValues) => {
    form.clearErrors("root")
    mutation.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <FormInputText
            form={form}
            name="firstName"
            label={t("signUp.firstName")}
            autoComplete="given-name"
            required
          />
          <FormInputText
            form={form}
            name="lastName"
            label={t("signUp.lastName")}
            autoComplete="family-name"
            required
          />
        </div>
        <FormInputText
          form={form}
          name="username"
          label={t("signUp.username")}
          autoComplete="username"
          required
        />
        <FormInputText
          form={form}
          name="email"
          type="email"
          label={t("signUp.email")}
          autoComplete="email"
          required
        />
        <FormInputText
          form={form}
          name="password"
          type="password"
          label={t("signUp.password")}
          autoComplete="new-password"
          required
        />
        <FormInputText
          form={form}
          name="confirmPassword"
          type="password"
          label={t("signUp.confirmPassword")}
          autoComplete="new-password"
          required
        />
        <FormInputText
          form={form}
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          label={t("signUp.phoneOptional")}
          autoComplete="tel"
          placeholder={t("signUp.phonePlaceholder")}
        />

        <AuthFormRootError message={form.formState.errors.root?.message} />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("signUp.submitting") : t("signUp.submit")}
        </Button>
      </form>
    </Form>
  )
}
