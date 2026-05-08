import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { CONTENT_VERSIONS } from "@/features/content/data/content-mock"
import { T } from "@/lib/tokens"

function Chip({ label, color = "gray", dot = false, size = "xs" }: { label: string; color?: string; dot?: boolean; size?: string }) {
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: size === "xs" ? "2px 7px" : "3px 9px", borderRadius: 20, background: c.bg, color: c.text, border: `1px solid ${c.border}`, fontSize: size === "xs" ? 10 : 11, fontWeight: 600, lineHeight: 1.5, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.text, flexShrink: 0 }} />}
      {label}
    </span>
  )
}

function Btn({ children, variant = "primary", size = "xs", onClick, style: ex = {} }: { children: React.ReactNode; variant?: string; size?: string; onClick?: () => void; style?: React.CSSProperties }) {
  const vs: Record<string, React.CSSProperties> = {
    primary:     { background: T.accent, color: "white" },
    secondary:   { background: "white", color: T.textPrimary, border: `1px solid ${T.surfaceBorder}` },
    ghost:       { background: "transparent", color: T.textSecondary, border: "1px solid transparent" },
    accent:      { background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` },
    destructive: { background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}` },
  }
  const sizes: Record<string, React.CSSProperties> = {
    xs: { padding: "4px 10px", fontSize: 11 },
    sm: { padding: "6px 13px", fontSize: 12 },
  }
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap", border: "none", outline: "none", ...(vs[variant] ?? vs.primary), ...(sizes[size] ?? sizes.xs), ...ex }}>{children}</button>
  )
}

export default function ContentPage() {
  const navigate = useNavigate()
  const [activeV, setActiveV] = useState("v2")
  const [editText, setEditText] = useState("Songkran สุขสันต์! 🎉 ช้อปเลยวันนี้ รับส่วนลดสูงสุด 50% ฉลองเทศกาลน้ำกับเรา! #Songkran2026 #สงกรานต์ #ThaiSummer")

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Version sidebar */}
      <div style={{ width: 196, minWidth: 196, borderRight: `1px solid ${T.surfaceBorder}`, background: "white", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>Versions</span>
          <button style={{ fontSize: 10, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Compare</button>
        </div>
        <div style={{ padding: "6px 0", flex: 1, overflowY: "auto" }}>
          {CONTENT_VERSIONS.map((v, i) => (
            <div key={v.id} onClick={() => setActiveV(v.id)} style={{
              padding: "10px 16px", cursor: "pointer",
              borderLeft: `3px solid ${activeV === v.id ? T.accent : "transparent"}`,
              background: activeV === v.id ? T.accentLight : "transparent", transition: "all 0.12s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: activeV === v.id ? T.accent : T.textPrimary }}>{v.label}</span>
                <span style={{ fontSize: 10, color: T.textMuted }}>{v.time}</span>
              </div>
              <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.4 }}>{v.summary}</div>
              {i < CONTENT_VERSIONS.length - 1 && (
                <button style={{ marginTop: 6, fontSize: 10, color: T.textSecondary, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Restore</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Draft cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Draft · {activeV.toUpperCase()}</h2>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: T.textMuted }}>Songkran Promo 2026 · Run #4821</p>
          </div>
          <Chip label="Draft" color="amber" dot />
        </div>

        {/* Text card */}
        <div style={{ background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
          <div style={{ padding: "10px 14px", background: "#E0FAF5", borderBottom: "1px solid #80E5D1", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M1 6.5h9M1 10h10" stroke="#00A589" strokeWidth="1.4" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#00A589" }}>Text Generation</span>
              <Chip label="Done" color="green" dot />
            </div>
            <Btn variant="accent" size="xs">↻ Re-run</Btn>
          </div>
          <div style={{ padding: 14 }}>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4}
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", color: T.textPrimary, resize: "vertical", outline: "none", lineHeight: 1.65, background: "#FDFCFA" }}
              onFocus={(e) => { e.target.style.borderColor = T.accent; e.target.style.boxShadow = `0 0 0 3px ${T.accent}14` }}
              onBlur={(e) => { e.target.style.borderColor = T.surfaceBorder; e.target.style.boxShadow = "none" }}
            />
          </div>
        </div>

        {/* Image card */}
        <div style={{ background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
          <div style={{ padding: "10px 14px", background: "#FEE2E2", borderBottom: "1px solid #FCA5A5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2" stroke="#DC2626" strokeWidth="1.3" /><circle cx="5" cy="5" r="1.2" fill="#DC2626" opacity="0.5" /><path d="M1 10l3-3 3 3 2-2 4 4" stroke="#DC2626" strokeWidth="1.1" strokeLinejoin="round" /></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.red }}>Image Generation</span>
              <Chip label="Failed" color="red" dot />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="destructive">Remove</Btn>
              <Btn variant="secondary">↑ Upload</Btn>
              <Btn variant="ghost">↻ Re-run</Btn>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ height: 140, borderRadius: 8, border: "2px dashed #FCA5A5", background: "repeating-linear-gradient(135deg,#FFF5F5,#FFF5F5 6px,#FEE2E2 6px,#FEE2E2 12px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#FCA5A5" strokeWidth="1.5" /><path d="M12 8v5M12 15.5v.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>Image generation failed</span>
              <span style={{ fontSize: 10, color: "#FCA5A5" }}>Upload a replacement or re-run this node</span>
            </div>
          </div>
        </div>

        {/* Translation card */}
        <div style={{ background: "white", border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
          <div style={{ padding: "10px 14px", background: "#FFFBEB", borderBottom: "1px solid #FCD34D", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3.5h6M4 1.5v2M2.5 3.5c.5 2 2 3 3.5 3.5M4 3.5c-.5 2-1.5 3-3 4" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round" /><path d="M7 9h6M10 7.5l2 3.5-2 3.5" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.amber }}>Translation</span>
              <Chip label="Blocked" color="amber" dot />
            </div>
            <Btn variant="ghost">↻ Re-run when ready</Btn>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: T.amber, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 7, padding: "9px 11px", lineHeight: 1.5 }}>
              ⏳ Waiting for Image Generation to complete before translating combined output.
            </div>
          </div>
        </div>
      </div>

      {/* Approval panel */}
      <div style={{ width: 252, minWidth: 252, borderLeft: `1px solid ${T.surfaceBorder}`, background: "white", display: "flex", flexDirection: "column", padding: "16px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 16 }}>Approval</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 20 }}>
          {[
            ["Status",   <Chip label="Draft" color="amber" dot />],
            ["Rule",     <button style={{ background: "none", border: "none", cursor: "pointer", color: T.accent, fontSize: 12, padding: 0, fontFamily: "inherit", fontWeight: 700 }}>Songkran Rule v2 ↗</button>],
            ["Workflow", <button style={{ background: "none", border: "none", cursor: "pointer", color: T.accent, fontSize: 12, padding: 0, fontFamily: "inherit", fontWeight: 700 }}>Songkran Promo 2026 ↗</button>],
            ["Run",      <button style={{ background: "none", border: "none", cursor: "pointer", color: T.accent, fontSize: 12, padding: 0, fontFamily: "inherit", fontWeight: 700 }}>Run #4821 ↗</button>],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.surfaceBorder}` }}>
              <span style={{ fontSize: 12, color: T.textSecondary, fontWeight: 500 }}>{k as string}</span>
              {v as React.ReactNode}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => navigate("/upload")} style={{ width: "100%", padding: "9px 0", background: T.accent, color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Approve & Send to Upload
          </button>
          <button style={{ width: "100%", padding: "9px 0", background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13 }}>Reject — keep editing</button>
        </div>
      </div>
    </div>
  )
}
