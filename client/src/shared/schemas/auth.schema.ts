import type { TFunction } from "i18next"
import { z } from "zod"

export function createLoginSchema(t: TFunction<"validation">) {
  return z.object({
    username: z.string().min(1, t("usernameRequired")),
    password: z.string().min(1, t("fieldRequired")),
  })
}

export type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>

export function createSignupSchema(t: TFunction<"validation">) {
  return z
    .object({
      firstName: z.string().min(1, t("firstNameRequired")),
      lastName: z.string().min(1, t("lastNameRequired")),
      username: z.string().min(1, t("usernameRequired")),
      email: z.string().min(1, t("fieldRequired")).email(t("emailInvalid")),
      password: z.string().min(8, t("passwordMin")),
      confirmPassword: z.string().min(8, t("confirmPasswordMin")),
      phoneNumber: z.string().optional().or(z.literal("")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    })
}

export type SignupFormValues = z.infer<ReturnType<typeof createSignupSchema>>

export function createForgotPasswordSchema(t: TFunction<"validation">) {
  return z.object({
    email: z.string().min(1, t("fieldRequired")).email(t("emailInvalid")),
  })
}

export type ForgotPasswordFormValues = z.infer<
  ReturnType<typeof createForgotPasswordSchema>
>

export function createVerifyOtpSchema(t: TFunction<"validation">) {
  return z.object({
    email: z.string().min(1, t("fieldRequired")).email(t("emailInvalid")),
    code: z.string().regex(/^\d{6}$/, t("otpCode6Digits")),
  })
}

export type VerifyOtpFormValues = z.infer<ReturnType<typeof createVerifyOtpSchema>>

export function createResetPasswordSchema(t: TFunction<"validation">) {
  return z
    .object({
      newPassword: z.string().min(8, t("passwordMin")),
      confirmPassword: z.string().min(8, t("confirmPasswordMin")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    })
}

export type ResetPasswordFormValues = z.infer<
  ReturnType<typeof createResetPasswordSchema>
>
