export const DB_STATS = [
  { label: "Active Campaigns", value: "7", delta: "+2 this week", up: true },
  { label: "Generations This Week", value: "34", delta: "+12 vs last week", up: true },
  { label: "Pending Approvals", value: "3", delta: null as string | null, up: null as boolean | null },
  { label: "Scheduled Posts", value: "18", delta: "+5 this week", up: true },
] as const

export const DB_GENS = [
  { campaign: "Songkran Promo 2026", workflow: "Social + Image", status: "done", updated: "2h ago" },
  { campaign: "BKK Café Launch", workflow: "Full Campaign", status: "running", updated: "10m ago" },
  { campaign: "Summer Sale TH", workflow: "Social Only", status: "pending", updated: "1d ago" },
  { campaign: "MagX Product Launch", workflow: "Social + Video", status: "failed", updated: "3d ago" },
  { campaign: "LINE OA Weekly", workflow: "Newsletter + Trans.", status: "done", updated: "5d ago" },
] as const

export const DB_SUGGESTIONS = [
  {
    text: 'Add "ลด 50%" to Rule keywords — seen in top-performing posts this week.',
    campaign: "Songkran Promo 2026",
  },
  {
    text: "Captions under 80 chars outperformed long-form on Instagram 3× this month.",
    campaign: "BKK Café Launch",
  },
  {
    text: "LINE OA has 2× higher open rate than other channels for this audience segment.",
    campaign: "All campaigns",
  },
] as const

export const DB_RULES = [
  { name: "Songkran Rule v2", channels: ["FB", "IG", "TT"], lastUsed: "Today" },
  { name: "BKK Café Brand", channels: ["IG", "LINE"], lastUsed: "2d ago" },
  { name: "E-comm Default", channels: ["FB", "IG", "TT", "LI"], lastUsed: "1w ago" },
  { name: "Formal Corporate", channels: ["LI", "FB"], lastUsed: "2w ago" },
] as const
