import { useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import Loader from "@/components/core/loader"
import { me } from "@/features/admin/api/auth-api"
import { verifyOrigin } from "@/features/auth/api/auth-flow-api"

/**
 * Landing page for the Competition Event "Open Mosonic" SSO handoff.
 * Confirms the referral code, then checks for an existing cookie session in
 * this browser — it never mints a new session itself (Mosonic sessions can
 * only be issued via the real SSO login/OTP flow), so a visitor with no
 * active session lands on /login rather than being silently signed in.
 */
export default function VerifyOriginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const code = searchParams.get("code")

    async function run() {
      if (code) {
        try {
          await verifyOrigin(code)
        } catch {
          // Invalid/expired code — still worth checking for an existing session below.
        }
      }

      try {
        await me()
        navigate("/dashboard", { replace: true })
      } catch {
        navigate("/login", { replace: true })
      }
    }

    void run()
  }, [searchParams, navigate])

  return <Loader />
}
