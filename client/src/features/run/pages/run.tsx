import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  LOG_COLORS,
  LOG_ENTRIES,
  RUN_NODES,
  RUN_STATUS,
  RUN_STATUS_CHIP,
} from "@/features/run/data/run-mock"
import { T, type ChipColor } from "@/lib/tokens"

function Chip({ label, color = "gray", dot = false }: { label: string; color?: ChipColor; dot?: boolean }) {
  const map: Record<ChipColor, { bg: string; text: string; border: string }> = {
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

function Btn({ children, variant = "primary", size = "sm", onClick }: { children: React.ReactNode; variant?: string; size?: string; onClick?: () => void }) {
  const vs: Record<string, React.CSSProperties> = {
    primary:     { background: T.accent, color: "white" },
    secondary:   { background: "white", color: T.textPrimary, border: `1px solid ${T.surfaceBorder}` },
    ghost:       { background: "transparent", color: T.textSecondary, border: "1px solid transparent" },
    destructive: { background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}` },
  }
  const sizes: Record<string, React.CSSProperties> = {
    xs: { padding: "4px 10px", fontSize: 11 },
    sm: { padding: "6px 13px", fontSize: 12 },
  }
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
      whiteSpace: "nowrap", border: "none", outline: "none", transition: "all 0.15s",
      ...(vs[variant] ?? vs.primary), ...(sizes[size] ?? sizes.sm),
    }}>{children}</button>
  )
}

export default function RunPage() {
  const navigate = useNavigate()
  const [logFilter, setLogFilter] = useState("all")
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [])

  const filtered = logFilter === "all" ? LOG_ENTRIES : LOG_ENTRIES.filter((l) => l.level.toLowerCase().startsWith(logFilter))

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{ padding: "12px 24px", background: "white", borderBottom: `1px solid ${T.surfaceBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Songkran Promo 2026</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Run #4821 · Started 10:42:01 · 2 nodes completed</div>
        </div>
        <Chip label="● Running" color="blue" dot />
        <Btn variant="secondary">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="2" y="2" width="3" height="7" rx="1" fill="currentColor" /><rect x="6" y="2" width="3" height="7" rx="1" fill="currentColor" /></svg>
          Pause
        </Btn>
        <Btn variant="destructive">Cancel</Btn>
      </div>

      {/* Split layout */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "3fr 2fr", overflow: "hidden" }}>

        {/* Pipeline */}
        <div style={{ padding: 24, overflowY: "auto", borderRight: `1px solid ${T.surfaceBorder}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16 }}>Pipeline Progress</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {RUN_NODES.map((node, i) => {
              const sc = RUN_STATUS[node.status] ?? RUN_STATUS.idle
              return (
                <span key={node.id}>
                  <div style={{
                    border: `1.5px solid ${sc.border}`, borderRadius: 12, background: sc.bg,
                    padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
                    boxShadow: `0 1px 3px ${sc.border}40`,
                  }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: "white", border: `1px solid ${sc.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      {i === 0 ? "✎" : i === 1 ? "⬜" : "⇄"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{node.label}</span>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                        <Chip label={node.status.charAt(0).toUpperCase() + node.status.slice(1)} color={RUN_STATUS_CHIP[node.status] ?? "gray"} />
                        {node.time !== "—" && <span style={{ fontSize: 10, color: T.textMuted }}>⏱ {node.time}</span>}
                      </div>
                      {node.preview && (
                        <div style={{ fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 11, color: T.textPrimary, background: "white", border: `1px solid ${sc.border}`, borderRadius: 6, padding: "7px 10px", lineHeight: 1.5 }}>
                          {node.preview}
                        </div>
                      )}
                      {node.status === "failed" && (
                        <div style={{ marginTop: 8, display: "flex", gap: 7, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: T.red }}>Timed out after 2 attempts.</span>
                          <Btn variant="secondary" size="xs">↩ Retry</Btn>
                          <Btn variant="ghost" size="xs">Skip →</Btn>
                        </div>
                      )}
                    </div>
                  </div>
                  {i < RUN_NODES.length - 1 && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "2px 0" }}>
                      <div style={{ width: 1.5, height: 22, background: `linear-gradient(to bottom,${RUN_STATUS[RUN_NODES[i].status]?.dot ?? "#A0AEC0"},${RUN_STATUS[RUN_NODES[i + 1].status]?.dot ?? "#A0AEC0"})`, opacity: 0.4 }} />
                    </div>
                  )}
                </span>
              )
            })}
          </div>
        </div>

        {/* Log stream */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "#040B15" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #0F1F3D", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#8888AA", marginRight: 4 }}>Live Logs</span>
            {["all", "info", "warn", "error"].map((f) => (
              <button key={f} onClick={() => setLogFilter(f)} style={{
                padding: "3px 9px", borderRadius: 20, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                border: logFilter === f ? "1.5px solid #00A589" : "1px solid #0F1F3D",
                background: logFilter === f ? "#1A1A2E" : "transparent",
                color: logFilter === f ? "#8899FF" : "#3A3A55",
                fontWeight: logFilter === f ? 700 : 400, textTransform: "capitalize", transition: "all 0.12s",
              }}>{f}</button>
            ))}
          </div>
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
            {filtered.map((l, i) => {
              const lc = LOG_COLORS[l.level] ?? LOG_COLORS.INFO
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 14px", fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 11, lineHeight: 1.6 }}>
                  <span style={{ color: "#3A3A55", flexShrink: 0, fontSize: 10 }}>{l.time}</span>
                  <span style={{ display: "inline-flex", padding: "0px 6px", borderRadius: 4, background: lc.bg + "20", color: lc.text, fontSize: 9, fontWeight: 700, letterSpacing: "0.5px", flexShrink: 0, lineHeight: 1.8 }}>{l.level}</span>
                  <span style={{ color: l.level === "ERROR" ? "#FCA5A5" : l.level === "WARN" ? "#FCD34D" : "#8888AA" }}>{l.msg}</span>
                </div>
              )
            })}
            <div style={{ padding: "3px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
              <span style={{ display: "inline-block", width: 7, height: 14, background: "#00A589", opacity: 0.7, animation: "ntBlink 1s step-end infinite", borderRadius: 1 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div style={{ background: "#FEF3C7", borderTop: "1px solid #FCD34D", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2l6 12H2L8 2z" stroke="#D97706" strokeWidth="1.4" strokeLinejoin="round" fill="#FEF3C7" /><path d="M8 7v3M8 11.5v.5" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" /></svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#92400E", flex: 1 }}>Image Generation failed. 2 of 3 nodes succeeded. Review and retry or proceed.</span>
        <Btn variant="secondary">Retry failed nodes</Btn>
        <Btn variant="primary" onClick={() => navigate("/content")}>Review Draft →</Btn>
      </div>
    </div>
  )
}
