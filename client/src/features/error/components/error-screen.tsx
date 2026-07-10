import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Compass, Home, LifeBuoy, LogOut, ShieldBan } from "lucide-react"

import Logo from "@/assets/icon/logo"
import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/language-switcher"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

export type ErrorScreenVariant = "suspended" | "notFound"

type ErrorScreenProps = {
  variant: ErrorScreenVariant
}

/** Full-viewport, theme-aware error screen for suspended accounts and 404s. */
export function ErrorScreen({ variant }: ErrorScreenProps) {
  const { t } = useTranslation("common")
  const navigate = useNavigate()

  const isSuspended = variant === "suspended"
  const scope = isSuspended ? "errorPage.suspended" : "errorPage.notFound"
  const accent = isSuspended ? "destructive" : "primary"

  const handleLogout = () => {
    useUserStore.getState().clearUser()
    void useAuthStore.getState().logout()
    navigate("/login", { replace: true })
  }

  return (
    <main className="relative flex min-h-svh w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            "absolute -top-40 -left-32 size-[36rem] rounded-full blur-3xl",
            isSuspended
              ? "bg-destructive/15 dark:bg-destructive/20"
              : "bg-teal-400/20 dark:bg-teal-500/15",
          )}
        />
        <div className="absolute -right-40 -bottom-48 size-[40rem] rounded-full bg-navy-400/15 blur-3xl dark:bg-navy-500/20" />
        <div className="absolute top-1/3 left-1/2 size-[24rem] -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl dark:bg-amber-400/10" />
        <div
          className="absolute inset-0 opacity-[0.4] dark:opacity-[0.25]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 0)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black 40%, transparent 100%)",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-2.5" aria-label={t("appName")}>
          <Logo className="size-8 shrink-0" />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-[-0.3px]">{t("appName")}</div>
            <div className="text-[9px] font-semibold tracking-[1.2px] text-primary uppercase">
              {t("appTagline")}
            </div>
          </div>
        </Link>
        <LanguageSwitcher />
      </header>

      {/* Content */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        {/* Giant watermark code */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 select-none font-heading font-black tracking-tighter",
            "text-[9rem] leading-none sm:text-[16rem] lg:text-[20rem]",
            isSuspended ? "text-destructive/[0.06]" : "text-primary/[0.06]",
          )}
        >
          {t(`${scope}.code`)}
        </span>

        <div className="animate-[fadeUp_0.5s_ease-out] flex w-full max-w-xl flex-col items-center text-center">
          <span
            className={cn(
              "mb-6 inline-flex size-20 items-center justify-center rounded-2xl ring-1 shadow-sm",
              isSuspended
                ? "bg-destructive/10 text-destructive ring-destructive/20"
                : "bg-primary/10 text-primary ring-primary/20",
            )}
          >
            {isSuspended ? (
              <ShieldBan className="size-10" strokeWidth={1.75} />
            ) : (
              <Compass className="size-10" strokeWidth={1.75} />
            )}
          </span>

          <span
            className={cn(
              "mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase",
              isSuspended
                ? "border-destructive/20 bg-destructive/5 text-destructive"
                : "border-primary/20 bg-primary/5 text-primary",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                accent === "destructive" ? "bg-destructive" : "bg-primary",
              )}
            />
            {t(`${scope}.badge`)}
          </span>

          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
            {t(`${scope}.title`)}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">
            {t(`${scope}.description`)}
          </p>

          {/* Actions */}
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            {isSuspended ? (
              <>
                <a
                  href={`mailto:${t("errorPage.supportEmail")}`}
                  className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full sm:w-auto")}
                >
                  <LifeBuoy className="size-4" />
                  {t(`${scope}.primaryAction`)}
                </a>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleLogout}
                  className="w-full sm:w-auto"
                >
                  <LogOut className="size-4" />
                  {t(`${scope}.secondaryAction`)}
                </Button>
              </>
            ) : (
              <>
                <Link
                  to="/dashboard"
                  className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full sm:w-auto")}
                >
                  <Home className="size-4" />
                  {t(`${scope}.primaryAction`)}
                </Link>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => navigate(-1)}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="size-4" />
                  {t(`${scope}.secondaryAction`)}
                </Button>
              </>
            )}
          </div>

          {isSuspended ? (
            <p className="mt-6 text-xs text-muted-foreground">
              {t(`${scope}.supportNote`)}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
