export const CHART_DATA = [
  { date: "Apr 27", fb: 3200, ig: 2100, x: 800 },
  { date: "Apr 28", fb: 4100, ig: 2800, x: 900 },
  { date: "Apr 29", fb: 3800, ig: 3100, x: 1100 },
  { date: "Apr 30", fb: 5200, ig: 3700, x: 1200 },
  { date: "May 1", fb: 6100, ig: 4200, x: 1400 },
  { date: "May 2", fb: 5700, ig: 3900, x: 1100 },
  { date: "May 3", fb: 7400, ig: 5100, x: 1600 },
]

export const ENG_DATA = [
  { channel: "Facebook", value: 3420 },
  { channel: "Instagram", value: 4100 },
  { channel: "X/Twitter", value: 820 },
  { channel: "LINE", value: 1200 },
  { channel: "LinkedIn", value: 300 },
]

export const ANALYTICS_STATS = [
  { label: "Total Views", value: "84.2k", delta: "+12%", up: true },
  { label: "Total Engagement", value: "9,840", delta: "+7%", up: true },
  { label: "Click-Through", value: "3.2%", delta: "-0.4%", up: false },
  { label: "Conversions", value: "412", delta: "+22%", up: true },
] as const

export const ANALYTICS_SUGGESTIONS = [
  {
    text: 'Posts with "ลด 50%" gained 34% more engagement — add to Rule keywords.',
    campaign: "Songkran Promo 2026",
  },
  {
    text: "Captions under 80 chars outperformed long-form on Instagram 3× this month.",
    campaign: "BKK Café Launch",
  },
  {
    text: "LINE OA has 2× higher open rate than X for this audience.",
    campaign: "All campaigns",
  },
] as const

export const ANALYTICS_TOP = [
  ["Songkran FB Post", "Facebook", "7,400 views", true],
  ["Product Story IG", "Instagram", "5,100 views", true],
  ["Summer Carousel", "Instagram", "4,900 views", true],
] as const

export const ANALYTICS_BOTTOM = [
  ["Corporate LI v1", "LinkedIn", "210 views", false],
  ["X Thread 2", "X/Twitter", "380 views", false],
  ["Newsletter Apr Wk3", "Email", "1.2% CTR", false],
] as const
