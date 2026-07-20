export type TimezoneOption = {
  value: string
  label: string
  group: "suggested" | "americas" | "europe" | "africa" | "asia_pacific"
}

/** Curated IANA zones — Asia/Bangkok first in suggested for Mosonic. */
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "Asia/Bangkok", label: "Bangkok (ICT)", group: "suggested" },
  { value: "UTC", label: "UTC", group: "suggested" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", group: "suggested" },
  { value: "Asia/Jakarta", label: "Jakarta (WIB)", group: "suggested" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (ICT)", group: "suggested" },
  { value: "Asia/Manila", label: "Manila (PHT)", group: "suggested" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (MYT)", group: "suggested" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", group: "suggested" },
  { value: "Asia/Seoul", label: "Seoul (KST)", group: "suggested" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)", group: "suggested" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)", group: "suggested" },
  { value: "Asia/Dubai", label: "Dubai (GST)", group: "asia_pacific" },
  { value: "Asia/Kolkata", label: "Kolkata (IST)", group: "asia_pacific" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)", group: "asia_pacific" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)", group: "asia_pacific" },
  { value: "Europe/London", label: "London (GMT/BST)", group: "europe" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)", group: "europe" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)", group: "europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)", group: "europe" },
  { value: "Europe/Moscow", label: "Moscow (MSK)", group: "europe" },
  { value: "Africa/Cairo", label: "Cairo (EET)", group: "africa" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)", group: "africa" },
  { value: "America/New_York", label: "New York (ET)", group: "americas" },
  { value: "America/Chicago", label: "Chicago (CT)", group: "americas" },
  { value: "America/Denver", label: "Denver (MT)", group: "americas" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)", group: "americas" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)", group: "americas" },
  { value: "America/Toronto", label: "Toronto (ET)", group: "americas" },
  { value: "America/Mexico_City", label: "Mexico City (CST)", group: "americas" },
]

const ZONE_SET = new Set(TIMEZONE_OPTIONS.map((z) => z.value))

export function getDefaultTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detected && ZONE_SET.has(detected)) return detected
    if (detected) return detected
  } catch {
    /* ignore */
  }
  return "Asia/Bangkok"
}

export function timezoneLabel(value: string): string {
  const hit = TIMEZONE_OPTIONS.find((z) => z.value === value)
  if (hit) return `${hit.label} · ${hit.value}`
  return value
}

/**
 * Interpret `yyyy-MM-ddTHH:mm` as wall-clock time in `timeZone`, return UTC ISO.
 */
export function zonedDateTimeLocalToUtcIso(
  local: string,
  timeZone: string,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim())
  if (!m) {
    throw new Error("Invalid datetime-local value")
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })

  function wallParts(ms: number) {
    const map = Object.fromEntries(
      dtf
        .formatToParts(new Date(ms))
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    )
    return {
      y: Number(map.year),
      mo: Number(map.month),
      d: Number(map.day),
      h: Number(map.hour),
      mi: Number(map.minute),
    }
  }

  let guessed = Date.UTC(y, mo - 1, d, h, mi, 0)
  for (let i = 0; i < 4; i += 1) {
    const actual = wallParts(guessed)
    const desiredAsUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
    const actualAsUtc = Date.UTC(
      actual.y,
      actual.mo - 1,
      actual.d,
      actual.h,
      actual.mi,
      0,
    )
    const delta = desiredAsUtc - actualAsUtc
    if (delta === 0) break
    guessed += delta
  }

  return new Date(guessed).toISOString()
}

export function isZonedDateTimeLocalInFuture(
  local: string,
  timeZone: string,
): boolean {
  try {
    const iso = zonedDateTimeLocalToUtcIso(local, timeZone)
    return new Date(iso).getTime() > Date.now()
  } catch {
    return false
  }
}

/** Format a UTC ISO instant as `yyyy-MM-ddTHH:mm` wall time in `timeZone`. */
export function utcIsoToZonedDateTimeLocal(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const map = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  )
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}
