import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

import Logo from "@/assets/icon/logo"
import { cn } from "@/lib/utils"

export const brandLogoSizeClass = {
  nav: "h-10 w-10",
  auth: "h-[5.5rem] w-[5.5rem] sm:h-24 sm:w-24",
} as const

export type BrandLogoSize = keyof typeof brandLogoSizeClass

type BrandLogoProps = {
  to?: string
  label?: string
  size?: BrandLogoSize
  className?: string
  linkClassName?: string
}

export function BrandLogo({
  to = "/",
  label,
  size = "nav",
  className,
  linkClassName,
}: BrandLogoProps) {
  const { t } = useTranslation("common")
  const ariaLabel = label ?? t("appName")
  const logo = (
    <Logo
      className={cn(brandLogoSizeClass[size], "mx-auto", className)}
      aria-label={ariaLabel}
    />
  )

  if (!to) {
    return logo
  }

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={cn("inline-flex shrink-0", linkClassName)}
    >
      {logo}
    </Link>
  )
}
