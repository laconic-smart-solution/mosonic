import { T } from "@/lib/tokens"

function Btn({ children, variant = "primary", size = "md", style: ex = {} }: { children: React.ReactNode; variant?: string; size?: string; style?: React.CSSProperties }) {
  const vs: Record<string, React.CSSProperties> = {
    primary:     { background: T.accent, color: "white" },
    secondary:   { background: "white", color: T.textPrimary, border: `1px solid ${T.surfaceBorder}` },
    ghost:       { background: "transparent", color: T.textSecondary, border: `1px solid ${T.surfaceBorder}` },
    destructive: { background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}` },
    accent:      { background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` },
  }
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: "5px 12px", fontSize: 11 },
    md: { padding: "7px 14px", fontSize: 12 },
    lg: { padding: "9px 18px", fontSize: 13 },
  }
  return (
    <button style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap", border: "none", outline: "none", ...(vs[variant] ?? vs.primary), ...(sizes[size] ?? sizes.md), ...ex }}>{children}</button>
  )
}

function Chip({ label, color = "gray", dot = false }: { label: string; color?: string; dot?: boolean }) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    gray:   { bg: "#EDF2F7", text: "#4A5568", border: "#D9E1EC" },
    indigo: { bg: T.accentLight, text: T.accent, border: T.accentBorder },
    green:  { bg: T.greenBg, text: T.green, border: T.greenBorder },
    amber:  { bg: T.amberBg, text: T.amber, border: T.amberBorder },
    red:    { bg: T.redBg, text: T.red, border: T.redBorder },
    blue:   { bg: T.blueBg, text: T.blue, border: T.blueBorder },
  }
  const c = map[color] ?? map.gray
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: c.bg, color: c.text, border: `1px solid ${c.border}`, fontSize: 11, fontWeight: 600, lineHeight: 1.5, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.text, flexShrink: 0 }} />}
      {label}
    </span>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.surfaceBorder}`, background: "#F9F8F5" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textPrimary, textTransform: "uppercase", letterSpacing: "0.7px" }}>{title}</span>
      </div>
      <div style={{ padding: "20px 18px" }}>{children}</div>
    </div>
  )
}

const NODE_VARIANTS = [
  { status: "idle",    label: "Text Generation",  nodeColor: "#00A589", nodeBg: "#E0FAF5", chipBg: "#EDF2F7",  chipText: "#718096", chipBd: "#EDE9E1", dot: "#A0AEC0", borderColor: "#EDE9E1", glowColor: "" },
  { status: "running", label: "Image Generation", nodeColor: "#254C94", nodeBg: "#E8EDF6", chipBg: T.blueBg,   chipText: T.blue,   chipBd: T.blueBorder, dot: T.blue,   borderColor: "#254C94", glowColor: "#254C9420" },
  { status: "done",    label: "Translation",      nodeColor: "#D97706", nodeBg: "#FFFBEB", chipBg: T.greenBg,  chipText: T.green,  chipBd: T.greenBorder, dot: T.green, borderColor: "#EDE9E1", glowColor: "" },
  { status: "failed",  label: "Video Generation", nodeColor: "#06B6D4", nodeBg: "#ECFEFF", chipBg: T.redBg,    chipText: T.red,    chipBd: T.redBorder, dot: T.red,     borderColor: "#EDE9E1", glowColor: "" },
]

export default function ComponentsLibPage() {
  return (
    <div style={{ padding: "28px 28px 40px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.5px" }}>Component Library</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: T.textSecondary }}>Visual vocabulary used throughout NeuralTex. Reference for consistent implementation.</p>
      </div>

      {/* Buttons */}
      <SectionCard title="Buttons">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Btn variant="primary">Primary</Btn>
          <Btn variant="secondary">Secondary</Btn>
          <Btn variant="ghost">Ghost</Btn>
          <Btn variant="destructive">Destructive</Btn>
          <Btn variant="accent">Accent</Btn>
          <Btn variant="primary" size="sm">Small</Btn>
          <Btn variant="primary" size="lg">Large</Btn>
          <Btn variant="primary">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 2l7 4-7 4V2z" fill="white" /></svg>
            With Icon
          </Btn>
        </div>
      </SectionCard>

      {/* Status Chips */}
      <SectionCard title="Status Chips">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {([
            ["Idle", "gray"], ["Ready", "indigo"], ["Running", "blue"], ["Done", "green"],
            ["Failed", "red"], ["Warning", "amber"], ["Draft", "amber"], ["Published", "green"],
            ["Archived", "gray"], ["Scheduled", "indigo"],
          ] as [string, string][]).map(([l, c]) => (
            <Chip key={l} label={l} color={c} dot />
          ))}
        </div>
      </SectionCard>

      {/* Node Card Variants */}
      <SectionCard title="Node Card Variants">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {NODE_VARIANTS.map((n) => (
            <div key={n.status} style={{
              width: 210, border: `1.5px solid ${n.borderColor}`, borderRadius: 12, background: "white",
              overflow: "hidden", boxShadow: n.glowColor ? `0 0 0 3px ${n.glowColor}, 0 2px 8px rgba(0,0,0,0.06)` : "0 2px 6px rgba(0,0,0,0.05)",
            }}>
              <div style={{ height: 3, background: `linear-gradient(90deg,${n.nodeColor},${n.nodeColor}80)` }} />
              <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #EDF2F7", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: n.nodeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: n.nodeColor }}>✎</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{n.label}</span>
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ fontSize: 11, color: T.textSecondary, marginBottom: 6, lineHeight: 1.4 }}>Click to add instruction…</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: n.chipBg, color: n.chipText, border: `1px solid ${n.chipBd}` }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: n.dot }} />
                  {n.status.charAt(0).toUpperCase() + n.status.slice(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Toasts / Notifications */}
      <SectionCard title="Toasts / Notifications">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
          {([
            { c: T.green, bg: T.greenBg, bd: T.greenBorder, icon: "✓", msg: "Rule saved successfully — ready to use in workflows." },
            { c: T.amber, bg: T.amberBg, bd: T.amberBorder, icon: "⚠", msg: "X/Twitter post exceeds limit by 32 characters." },
            { c: T.red,   bg: T.redBg,   bd: T.redBorder,   icon: "✕", msg: "Image generation failed. Check your API quota." },
            { c: T.blue,  bg: T.blueBg,  bd: T.blueBorder,  icon: "ℹ", msg: "Pipeline running — estimated completion in ~45 seconds." },
          ]).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 9, boxShadow: `0 1px 3px ${t.bd}40` }}>
              <span style={{ color: t.c, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{t.icon}</span>
              <span style={{ fontSize: 12, color: T.textPrimary, lineHeight: 1.55, flex: 1 }}>{t.msg}</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: t.c, flexShrink: 0, display: "flex", padding: 0, opacity: 0.7 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Empty State */}
      <SectionCard title="Empty State">
        <div style={{ border: `2px dashed ${T.surfaceBorder}`, borderRadius: 12, padding: "36px 24px", textAlign: "center", maxWidth: 360, background: "#FDFCFA" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: T.accentLight, border: `1px solid ${T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 6h16M3 11h12M3 16h14" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" /></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>No rules yet</div>
          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6, marginBottom: 18 }}>Define your brand strategy once and reuse it across all campaigns.</div>
          <Btn variant="primary">+ Create your first Rule</Btn>
        </div>
      </SectionCard>

      {/* Typography */}
      <SectionCard title="Typography">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Page Title", style: { fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.5px" }, text: "Analytics" },
            { label: "Section Heading", style: { fontSize: 16, fontWeight: 700, color: T.textPrimary }, text: "Draft · V2" },
            { label: "Card Title", style: { fontSize: 13, fontWeight: 700, color: T.textPrimary }, text: "Views Over Time" },
            { label: "Body / Primary", style: { fontSize: 13, color: T.textPrimary, lineHeight: 1.6 }, text: "Captions under 80 chars outperformed long-form on Instagram 3× this month." },
            { label: "Secondary", style: { fontSize: 12, color: T.textSecondary }, text: "Performance across all campaigns and channels." },
            { label: "Muted / Timestamp", style: { fontSize: 11, color: T.textMuted, fontFamily: "ui-monospace,monospace" }, text: "2026-05-04 10:42:33" },
            { label: "Label / Overline", style: { fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.8px" }, text: "Total Views" },
          ].map(({ label, style, text }) => (
            <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <span style={{ width: 140, fontSize: 10, color: T.textMuted, fontWeight: 600, flexShrink: 0 }}>{label}</span>
              <span style={style}>{text}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Color Palette */}
      <SectionCard title="Color Palette">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {[
            { name: "Accent",        hex: T.accent,       label: "#00A589" },
            { name: "Accent Light",  hex: T.accentLight,  label: "#E0FAF5" },
            { name: "Green",         hex: T.green,        label: "#16A34A" },
            { name: "Amber",         hex: T.amber,        label: "#D48A0E" },
            { name: "Red",           hex: T.red,          label: "#DC2626" },
            { name: "Blue",          hex: T.blue,         label: "#2563EB" },
            { name: "Text Primary",  hex: T.textPrimary,  label: "#090C11" },
            { name: "Text Secondary",hex: T.textSecondary,label: "#4A5568" },
            { name: "Text Muted",    hex: T.textMuted,    label: "#718096" },
            { name: "Canvas Bg",     hex: T.canvasBg,     label: "#F7F4EF" },
            { name: "Surface",       hex: T.surfaceBg,    label: "#FFFFFF" },
            { name: "Sidebar",       hex: T.sidebarBg,    label: "#040B15" },
          ].map(({ name, hex, label }) => (
            <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 72 }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, background: hex, border: `1px solid ${T.surfaceBorder}`, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.textPrimary }}>{name}</div>
                <div style={{ fontSize: 9, color: T.textMuted, fontFamily: "ui-monospace,monospace" }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
