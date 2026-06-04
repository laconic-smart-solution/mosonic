/** BCP 47 locale for Intl date/number formatting from i18next language code. */
export function getIntlLocale(lng: string): string {
  if (lng === "zh-CN" || lng.startsWith("zh")) return "zh-CN"
  if (lng === "th" || lng.startsWith("th")) return "th-TH"
  return "en-US"
}

export function formatDate(
  value: Date | string | number,
  lng: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleDateString(getIntlLocale(lng), options)
}

export function formatDateTime(
  value: Date | string | number,
  lng: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleString(getIntlLocale(lng), options)
}

export function formatNumber(
  value: number,
  lng: string,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(getIntlLocale(lng), options)
}
