import { useState } from "react"
import { useParams } from "react-router-dom"
import { UPLOAD_CHANNELS, UPLOAD_STATUS_MAP } from "@/features/upload/data/upload-mock"
import { T } from "@/lib/tokens"

function Chip({ label, color = "gray", dot = false, size = "xs" }: { label: string; color?: string; dot?: boolean; size?: string }) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    gray:   { bg: "#EDF2F7", text: "#4A5568", border: "#D9E1EC" },
    indigo: { bg: T.accentLight, text: T.accent, border: T.accentBorder },
    green:  { bg: T.greenBg, text: T.green, border: T.greenBorder },
    amber:  { bg: T.amberBg, text: T.amber, border: T.amberBorder },
    red:    { bg: T.redBg, text: T.red, border: T.redBorder },
  }
  const c = map[color] ?? map.gray
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: size === "xs" ? "2px 7px" : "3px 9px", borderRadius: 20, background: c.bg, color: c.text, border: `1px solid ${c.border}`, fontSize: 10, fontWeight: 600, lineHeight: 1.5, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.text, flexShrink: 0 }} />}
      {label}
    </span>
  )
}

function Btn({ children, variant = "primary", size = "xs", onClick, style: ex = {} }: { children: React.ReactNode; variant?: string; size?: string; onClick?: () => void; style?: React.CSSProperties }) {
  const vs: Record<string, React.CSSProperties> = {
    primary:   { background: T.accent, color: "white" },
    secondary: { background: "white", color: T.textPrimary, border: `1px solid ${T.surfaceBorder}` },
    ghost:     { background: "transparent", color: T.textSecondary, border: "1px solid transparent" },
  }
  const sizes: Record<string, React.CSSProperties> = {
    xs: { padding: "4px 10px", fontSize: 11 },
    sm: { padding: "6px 13px", fontSize: 12 },
    md: { padding: "8px 16px", fontSize: 13 },
  }
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap", border: "none", outline: "none", ...(vs[variant] ?? vs.primary), ...(sizes[size] ?? sizes.xs), ...ex }}>{children}</button>
  )
}

export default function UploadPage() {
  const { uploadId } = useParams<{ uploadId?: string }>()
  const [published, setPublished] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)

  function publishAll() {
    setPublishing(true)
    UPLOAD_CHANNELS.forEach((ch, i) => setTimeout(() => setPublished((p) => [...p, ch.id]), i * 900 + 400))
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 0 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.5px" }}>Upload & Publish</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.textSecondary }}>Preview how content appears on each channel before going live.</p>
          {uploadId ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: T.textSecondary }}>
              Upload job: <code style={{ fontSize: 11 }}>{uploadId}</code>
            </p>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {UPLOAD_CHANNELS.map((ch) => {
            const isPublished = published.includes(ch.id)
            const effectiveStatus = isPublished ? "published" : ch.status
            const sm = UPLOAD_STATUS_MAP[effectiveStatus] ?? UPLOAD_STATUS_MAP.pending
            const over = ch.charCount && ch.charLimit && ch.charCount > ch.charLimit

            return (
              <div key={ch.id} style={{ background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
                {/* Channel header */}
                <div style={{ padding: "11px 14px", borderBottom: `1px solid ${T.surfaceBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: ch.color + "18", border: `1.5px solid ${ch.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: ch.color, flexShrink: 0 }}>{ch.icon}</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, flex: 1 }}>{ch.label}</span>
                  <Chip label={sm.label} color={sm.color} dot />
                  {over && <Chip label={`+${(ch.charCount ?? 0) - (ch.charLimit ?? 0)} chars`} color="red" />}
                </div>

                {/* Platform mockup */}
                <div style={{ padding: 12, background: "#EDF2F7" }}>
                  <div style={{ background: "white", borderRadius: 10, border: `1px solid ${T.surfaceBorder}`, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                    <div style={{ padding: "9px 11px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.surfaceBorder}` }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#00A589,#254C94)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0 }}>BK</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>BKK Agency Co.</div>
                        <div style={{ fontSize: 10, color: T.textMuted }}>Just now · Sponsored</div>
                      </div>
                    </div>
                    <div style={{ padding: "9px 11px", fontSize: 12, color: T.textPrimary, lineHeight: 1.55 }}>
                      {ch.text}
                      {ch.charCount && <span style={{ color: over ? T.red : T.textMuted, fontSize: 10, marginLeft: 4 }}>({ch.charCount}/{ch.charLimit})</span>}
                    </div>
                    <div style={{
                      background: "repeating-linear-gradient(135deg,#EDF2F7,#EDF2F7 6px,#EDE9E1 6px,#EDE9E1 12px)",
                      height: ch.aspect === "4:5" ? 150 : ch.aspect === "16:9" ? 88 : 100,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#718096", fontFamily: "ui-monospace,monospace", letterSpacing: "0.3px",
                    }}>[image · {ch.aspect}]</div>
                    <div style={{ padding: "8px 11px", display: "flex", gap: 14, borderTop: `1px solid ${T.surfaceBorder}` }}>
                      {["👍 Like", "💬 Comment", "↗ Share"].map((a) => <span key={a} style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>{a}</span>)}
                    </div>
                  </div>
                </div>

                {/* Card actions */}
                <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.surfaceBorder}`, display: "flex", gap: 6, alignItems: "center" }}>
                  <Btn variant="ghost">✎ Edit</Btn>
                  <Btn variant="secondary">⏰ Schedule</Btn>
                  <div style={{ marginLeft: "auto" }}>
                    {isPublished
                      ? <Chip label="✓ Published" color="green" dot />
                      : <Btn variant="primary">Publish now</Btn>
                    }
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Activity strip */}
        <div style={{ marginTop: 16, background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: "10px 16px", fontSize: 11, color: T.textSecondary, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", boxShadow: T.surfaceShadow }}>
          <span style={{ fontWeight: 700, color: T.textPrimary, fontSize: 11 }}>Activity</span>
          {published.length > 0
            ? published.map((id) => {
                const ch = UPLOAD_CHANNELS.find((c) => c.id === id)
                return <span key={id} style={{ color: T.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} /> {ch?.label} published</span>
              })
            : <span style={{ color: T.textMuted }}>No activity yet — use Publish now or Publish all to go live.</span>
          }
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ width: 236, minWidth: 236, borderLeft: `1px solid ${T.surfaceBorder}`, background: "white", display: "flex", flexDirection: "column", gap: 14, padding: 16, overflowY: "auto" }}>
        <div style={{ background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: 16, boxShadow: T.surfaceShadow }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>Bulk Actions</div>
          <Btn variant="primary" size="md" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }} onClick={publishAll}>
            {publishing ? "⏳ Publishing…" : "↑ Publish all now"}
          </Btn>
          <Btn variant="secondary" size="md" style={{ width: "100%", justifyContent: "center" }}>⏰ Schedule all</Btn>
        </div>

        <div style={{ background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: 14, boxShadow: T.surfaceShadow }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, marginBottom: 10 }}>Include in upload</div>
          {UPLOAD_CHANNELS.map((ch) => (
            <div key={ch.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: T.textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: ch.color, fontWeight: 700 }}>{ch.icon}</span>
                {ch.label}
              </span>
              <div style={{ width: 34, height: 18, borderRadius: 9, background: T.accent, cursor: "pointer", position: "relative", boxShadow: `0 1px 3px ${T.accent}50` }}>
                <div style={{ position: "absolute", right: 2, top: 2, width: 14, height: 14, borderRadius: "50%", background: "white", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 5, display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5l5.5 10H1L6.5 1.5z" stroke="#D97706" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6.5 6v2.5M6.5 10v.2" stroke="#D97706" strokeWidth="1.3" strokeLinecap="round" /></svg>
            Constraint Warning
          </div>
          <div style={{ fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>X/Twitter post is 312 characters — over limit by 32. Edit before publishing.</div>
        </div>
      </div>
    </div>
  )
}
