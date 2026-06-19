import type { SVGProps } from "react"

import { cn } from "@/lib/utils"

/** Original palette — for teal/blue brand gradients (sidebar pill, etc.). */
const logoOnBrandClass =
  "[--logo-stalk-back-a:rgba(15,31,61,0.45)] [--logo-stalk-back-b:rgba(15,31,61,0.82)] [--logo-stalk-front:#00C9A7] [--logo-segment:#F7F4EF] [--logo-leaf:#F5A623]"

/** Adapts to page theme — for neutral light/dark surfaces (navbar, auth, etc.). */
const logoAdaptiveClass = cn(
  logoOnBrandClass,
  "dark:[--logo-stalk-back-a:rgba(0,201,167,0.38)] dark:[--logo-stalk-back-b:rgba(63,216,186,0.62)] dark:[--logo-stalk-front:#00C9A7] dark:[--logo-segment:#F7F4EF] dark:[--logo-leaf:#F5A623]",
)

export type LogoVariant = "default" | "on-brand"

type LogoProps = SVGProps<SVGSVGElement> & {
  variant?: LogoVariant
}

function Logo({ className, variant = "default", ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width="100"
      height="100"
      role="img"
      aria-label="Mosonic icon"
      className={cn(variant === "on-brand" ? logoOnBrandClass : logoAdaptiveClass, className)}
      {...props}
    >
      <title>Mosonic icon</title>
      <desc>Clustered bamboo grove: three rising segmented stalks with a leaf.</desc>
      <rect x="20" y="50" width="15" height="40" rx="6" fill="var(--logo-stalk-back-a)" />
      <line
        x1="20"
        y1="71"
        x2="35"
        y2="71"
        stroke="var(--logo-segment)"
        strokeWidth="2"
      />
      <rect x="63" y="41" width="15" height="49" rx="6" fill="var(--logo-stalk-back-b)" />
      <line
        x1="63"
        y1="65"
        x2="78"
        y2="65"
        stroke="var(--logo-segment)"
        strokeWidth="2"
      />
      <rect x="41" y="22" width="17" height="68" rx="7" fill="var(--logo-stalk-front)" />
      <line
        x1="41"
        y1="47"
        x2="58"
        y2="47"
        stroke="var(--logo-segment)"
        strokeWidth="2.4"
      />
      <line
        x1="41"
        y1="70"
        x2="58"
        y2="70"
        stroke="var(--logo-segment)"
        strokeWidth="2.4"
      />
      <path d="M49 24 Q68 2 96 8 Q72 20 50 24 Z" fill="var(--logo-leaf)" />
    </svg>
  )
}

export default Logo
