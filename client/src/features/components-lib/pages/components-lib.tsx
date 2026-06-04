import { useTranslation } from "react-i18next"

import { T } from "@/lib/tokens"

function Btn({ children, variant = "primary", size = "md", style: ex = {} }: { children: React.ReactNode; variant?: string; size?: string; style?: React.CSSProperties }) {
  const vs: Record<string, React.CSSProperties> = {
    primary:     { background: T.accent, color: "white" },
    secondary:   { background: T.surfaceBg, color: T.textPrimary, border: `1px solid ${T.surfaceBorder}` },
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
    <div style={{ background: T.surfaceBg, border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.surfaceBorder}`, background: "#F9F8F5" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textPrimary, textTransform: "uppercase", letterSpacing: "0.7px" }}>{title}</span>
      </div>
      <div style={{ padding: "20px 18px" }}>{children}</div>
    </div>
  )
}

const NODE_VARIANTS = [
  { status: "idle" as const, labelKey: "nodes.textGeneration", nodeColor: "#00A589", nodeBg: "#E0FAF5", chipBg: "#EDF2F7",  chipText: "#718096", chipBd: "#EDE9E1", dot: "#A0AEC0", borderColor: "#EDE9E1", glowColor: "" },
  { status: "running" as const, labelKey: "nodes.imageGeneration", nodeColor: "#254C94", nodeBg: "#E8EDF6", chipBg: T.blueBg,   chipText: T.blue,   chipBd: T.blueBorder, dot: T.blue,   borderColor: "#254C94", glowColor: "#254C9420" },
  { status: "done" as const, labelKey: "nodes.translation", nodeColor: "#D97706", nodeBg: "#FFFBEB", chipBg: T.greenBg,  chipText: T.green,  chipBd: T.greenBorder, dot: T.green, borderColor: "#EDE9E1", glowColor: "" },
  { status: "failed" as const, labelKey: "nodes.videoGeneration", nodeColor: "#06B6D4", nodeBg: "#ECFEFF", chipBg: T.redBg,    chipText: T.red,    chipBd: T.redBorder, dot: T.red,     borderColor: "#EDE9E1", glowColor: "" },
]

const CHIP_ITEMS: { key: string; color: string }[] = [
  { key: "idle", color: "gray" },
  { key: "ready", color: "indigo" },
  { key: "running", color: "blue" },
  { key: "done", color: "green" },
  { key: "failed", color: "red" },
  { key: "warning", color: "amber" },
  { key: "draft", color: "amber" },
  { key: "published", color: "green" },
  { key: "archived", color: "gray" },
  { key: "scheduled", color: "indigo" },
]

const TOAST_KEYS = ["ruleSaved", "twitterLimit", "imageFailed", "pipelineRunning"] as const

const TYPOGRAPHY_ITEMS = [
  { labelKey: "typography.pageTitle", sampleKey: "typography.pageTitleSample", style: { fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.5px" } },
  { labelKey: "typography.sectionHeading", sampleKey: "typography.sectionHeadingSample", style: { fontSize: 16, fontWeight: 700, color: T.textPrimary } },
  { labelKey: "typography.cardTitle", sampleKey: "typography.cardTitleSample", style: { fontSize: 13, fontWeight: 700, color: T.textPrimary } },
  { labelKey: "typography.bodyPrimary", sampleKey: "typography.bodySample", style: { fontSize: 13, color: T.textPrimary, lineHeight: 1.6 } },
  { labelKey: "typography.secondary", sampleKey: "typography.secondarySample", style: { fontSize: 12, color: T.textSecondary } },
  { labelKey: "typography.muted", sampleKey: "typography.mutedSample", style: { fontSize: 11, color: T.textMuted, fontFamily: "ui-monospace,monospace" } },
  { labelKey: "typography.label", sampleKey: "typography.labelSample", style: { fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.8px" } },
]

const COLOR_ITEMS = [
  { nameKey: "colors.accent", hex: T.accent, code: "#00A589" },
  { nameKey: "colors.accentLight", hex: T.accentLight, code: "#E0FAF5" },
  { nameKey: "colors.green", hex: T.green, code: "#16A34A" },
  { nameKey: "colors.amber", hex: T.amber, code: "#D48A0E" },
  { nameKey: "colors.red", hex: T.red, code: "#DC2626" },
  { nameKey: "colors.blue", hex: T.blue, code: "#2563EB" },
  { nameKey: "colors.textPrimary", hex: T.textPrimary, code: "#090C11" },
  { nameKey: "colors.textSecondary", hex: T.textSecondary, code: "#4A5568" },
  { nameKey: "colors.textMuted", hex: T.textMuted, code: "#718096" },
  { nameKey: "colors.canvasBg", hex: T.canvasBg, code: "#F7F4EF" },
  { nameKey: "colors.surface", hex: T.surfaceBg, code: "#FFFFFF" },
  { nameKey: "colors.sidebar", hex: T.sidebarBg, code: "#040B15" },
]

export default function ComponentsLibPage() {
  const { t } = useTranslation("componentsLib")

  return (
    <div style={{ padding: "28px 28px 40px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.5px" }}>{t("page.title")}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: T.textSecondary }}>{t("page.subtitle")}</p>
      </div>

      <SectionCard title={t("sections.buttons")}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Btn variant="primary">{t("buttons.primary")}</Btn>
          <Btn variant="secondary">{t("buttons.secondary")}</Btn>
          <Btn variant="ghost">{t("buttons.ghost")}</Btn>
          <Btn variant="destructive">{t("buttons.destructive")}</Btn>
          <Btn variant="accent">{t("buttons.accent")}</Btn>
          <Btn variant="primary" size="sm">{t("buttons.small")}</Btn>
          <Btn variant="primary" size="lg">{t("buttons.large")}</Btn>
          <Btn variant="primary">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 2l7 4-7 4V2z" fill="white" /></svg>
            {t("buttons.withIcon")}
          </Btn>
        </div>
      </SectionCard>

      <SectionCard title={t("sections.statusChips")}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {CHIP_ITEMS.map(({ key, color }) => (
            <Chip key={key} label={t(`chips.${key}`)} color={color} dot />
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("sections.nodeCards")}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {NODE_VARIANTS.map((n) => (
            <div key={n.status} style={{
              width: 210, border: `1.5px solid ${n.borderColor}`, borderRadius: 12, background: T.surfaceBg,
              overflow: "hidden", boxShadow: n.glowColor ? `0 0 0 3px ${n.glowColor}, 0 2px 8px rgba(0,0,0,0.06)` : "0 2px 6px rgba(0,0,0,0.05)",
            }}>
              <div style={{ height: 3, background: `linear-gradient(90deg,${n.nodeColor},${n.nodeColor}80)` }} />
              <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #EDF2F7", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: n.nodeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: n.nodeColor }}>✎</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{t(n.labelKey)}</span>
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ fontSize: 11, color: T.textSecondary, marginBottom: 6, lineHeight: 1.4 }}>{t("nodes.addInstruction")}</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: n.chipBg, color: n.chipText, border: `1px solid ${n.chipBd}` }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: n.dot }} />
                  {t(`nodes.status.${n.status}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("sections.toasts")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
          {([
            { c: T.green, bg: T.greenBg, bd: T.greenBorder, icon: "✓", key: "ruleSaved" as const },
            { c: T.amber, bg: T.amberBg, bd: T.amberBorder, icon: "⚠", key: "twitterLimit" as const },
            { c: T.red,   bg: T.redBg,   bd: T.redBorder,   icon: "✕", key: "imageFailed" as const },
            { c: T.blue,  bg: T.blueBg,  bd: T.blueBorder,  icon: "ℹ", key: "pipelineRunning" as const },
          ]).map((toastItem, i) => (
            <div key={TOAST_KEYS[i]} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: toastItem.bg, border: `1px solid ${toastItem.bd}`, borderRadius: 9, boxShadow: `0 1px 3px ${toastItem.bd}40` }}>
              <span style={{ color: toastItem.c, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{toastItem.icon}</span>
              <span style={{ fontSize: 12, color: T.textPrimary, lineHeight: 1.55, flex: 1 }}>{t(`toasts.${toastItem.key}`)}</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: toastItem.c, flexShrink: 0, display: "flex", padding: 0, opacity: 0.7 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("sections.emptyState")}>
        <div style={{ border: `2px dashed ${T.surfaceBorder}`, borderRadius: 12, padding: "36px 24px", textAlign: "center", maxWidth: 360, background: "#FDFCFA" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: T.accentLight, border: `1px solid ${T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 6h16M3 11h12M3 16h14" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" /></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>{t("empty.title")}</div>
          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6, marginBottom: 18 }}>{t("empty.desc")}</div>
          <Btn variant="primary">{t("empty.cta")}</Btn>
        </div>
      </SectionCard>

      <SectionCard title={t("sections.typography")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {TYPOGRAPHY_ITEMS.map(({ labelKey, sampleKey, style }) => (
            <div key={labelKey} style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <span style={{ width: 140, fontSize: 10, color: T.textMuted, fontWeight: 600, flexShrink: 0 }}>{t(labelKey)}</span>
              <span style={style}>{t(sampleKey)}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("sections.colorPalette")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {COLOR_ITEMS.map(({ nameKey, hex, code }) => (
            <div key={nameKey} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 72 }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, background: hex, border: `1px solid ${T.surfaceBorder}`, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.textPrimary }}>{t(nameKey)}</div>
                <div style={{ fontSize: 9, color: T.textMuted, fontFamily: "ui-monospace,monospace" }}>{code}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
