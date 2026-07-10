/** True when SSO reports the account still needs email OTP verification. */
export function needsEmailVerification(otpVerified: boolean | null): boolean {
  return otpVerified === false
}

export function verifyOtpPath(email?: string | null): string {
  const trimmed = email?.trim()
  if (!trimmed) return "/verify-otp"
  return `/verify-otp?email=${encodeURIComponent(trimmed)}`
}
