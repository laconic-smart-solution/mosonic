/**
 * Decorative Welcome illustrations (from Designer handoff welcome.html).
 * All are aria-hidden and pointer-events:none via the `.welcome-art` class —
 * they must never intercept clicks.
 */
import { cn } from "@/lib/utils"

type ArtProps = { className?: string }

const MATRIX = [220, 232, 244].flatMap((cx) => [133, 145, 157].map((cy) => ({ cx, cy })))

export function WelcomeOrbitArt({ className }: ArtProps) {
  return (
    <svg className={cn("welcome-art", className)} viewBox="0 0 290 220" aria-hidden="true" focusable="false">
      <path d="M46 166C-8 72 113-12 191 58c61 54 2 149-75 114C32 135 90 32 171 58" stroke="#254C94" strokeWidth="1" opacity=".16" />
      <path d="M36 155C4 82 100 15 166 54" stroke="#00A589" strokeWidth="16" opacity=".07" />
      <circle cx="190" cy="59" r="7" fill="#F5A623" opacity=".5" />
      <path d="M90 193h20M100 183v20" stroke="#00A589" opacity=".4" />
      {MATRIX.map(({ cx, cy }) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill="#254C94" opacity=".2" />
      ))}
    </svg>
  )
}

export function WelcomeStackedCardsArt({ className }: ArtProps) {
  return (
    <svg className={cn("welcome-art", className)} viewBox="0 0 290 230" aria-hidden="true" focusable="false">
      <ellipse cx="163" cy="123" rx="104" ry="85" fill="#00C9A7" opacity=".07" />
      <g transform="rotate(13 153 110)">
        <rect className="welcome-art-paper" x="113" y="44" width="112" height="143" rx="13" />
        <rect x="127" y="59" width="84" height="61" rx="7" fill="#00C9A7" opacity=".13" />
        <path d="m138 103 17-19 14 11 15-23 18 31" stroke="#00A589" strokeWidth="2" opacity=".7" />
        <path d="M128 137h65M128 148h49" stroke="var(--welcome-art-line)" strokeWidth="4" />
      </g>
      <g transform="rotate(-13 99 130)">
        <rect className="welcome-art-paper" x="47" y="78" width="102" height="125" rx="12" />
        <rect x="60" y="93" width="76" height="55" rx="6" fill="#254C94" opacity=".12" />
        <circle cx="98" cy="119" r="17" fill="#254C94" opacity=".23" />
        <path d="M62 163h61M62 174h43" stroke="var(--welcome-art-line)" strokeWidth="4" />
      </g>
      <path d="M238 51c0 12-8 20-20 20 12 0 20 8 20 20 0-12 8-20 20-20-12 0-20-8-20-20Z" fill="#F5A623" />
      <circle cx="44" cy="60" r="4" fill="#00A589" opacity=".5" />
      <path d="M225 191h25M237 179v25" stroke="#00A589" strokeWidth="1.2" opacity=".4" />
    </svg>
  )
}

export function WelcomeSpark({ className }: ArtProps) {
  return (
    <svg className={cn("welcome-art", className)} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
