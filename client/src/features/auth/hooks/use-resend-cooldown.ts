import { useCallback, useEffect, useState } from "react"

export const OTP_RESEND_COOLDOWN_SECONDS = 60

/** Countdown for OTP resend — starts immediately (user just received a code). */
export function useResendCooldown(
  cooldownSeconds = OTP_RESEND_COOLDOWN_SECONDS,
) {
  const [secondsLeft, setSecondsLeft] = useState(cooldownSeconds)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  const restart = useCallback(() => {
    setSecondsLeft(cooldownSeconds)
  }, [cooldownSeconds])

  return {
    secondsLeft,
    canResend: secondsLeft === 0,
    restart,
  }
}
