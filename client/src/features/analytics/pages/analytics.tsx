import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts"

import { NtStatCard } from "@/components/app/nt-stat-card"
import {
  ANALYTICS_BOTTOM,
  ANALYTICS_STATS,
  ANALYTICS_SUGGESTIONS,
  ANALYTICS_TOP,
  CHART_DATA,
  ENG_DATA,
} from "@/features/analytics/data/analytics-mock"
import { T } from "@/lib/tokens"

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState("7d")

  return (
    <div style={{ padding: "28px 28px 40px", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.5px" }}>Analytics</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.textSecondary }}>Performance across all campaigns and channels.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ padding: "7px 10px", border: `1px solid ${T.surfaceBorder}`, borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", background: "white", color: T.textPrimary }}>
            <option>All Campaigns</option><option>Songkran Promo 2026</option><option>BKK Café Launch</option>
          </select>
          <div style={{ display: "flex", border: `1px solid ${T.surfaceBorder}`, borderRadius: 7, overflow: "hidden", background: "white" }}>
            {[["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"]].map(([v, l]) => (
              <button key={v} onClick={() => setRange(v)} style={{
                padding: "6px 12px", background: range === v ? T.accentLight : "transparent",
                border: "none", borderRight: v !== "90d" ? `1px solid ${T.surfaceBorder}` : "none",
                cursor: "pointer", fontSize: 11, color: range === v ? T.accent : T.textSecondary,
                fontWeight: range === v ? 700 : 400, fontFamily: "inherit", transition: "all 0.12s",
              }}>{l}</button>
            ))}
          </div>
          <select style={{ padding: "7px 10px", border: `1px solid ${T.surfaceBorder}`, borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", background: "white", color: T.textPrimary }}>
            <option>All Channels</option><option>Facebook</option><option>Instagram</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {ANALYTICS_STATS.map((s, i) => (
          <NtStatCard key={i} label={s.label} value={s.value} delta={s.delta} up={s.up} />
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
        <div style={{ background: T.surfaceBg, border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: "18px 20px", boxShadow: T.surfaceShadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Views Over Time</span>
            <div style={{ display: "flex", gap: 12, fontSize: 10, color: T.textSecondary }}>
              {[["Facebook", "#00A589"], ["Instagram", "#254C94"], ["X/Twitter", "#06B6D4"]].map(([l, c]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 14, height: 3, background: c, display: "inline-block", borderRadius: 2 }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={CHART_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="fbGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00A589" stopOpacity={0.1} /><stop offset="95%" stopColor="#00A589" stopOpacity={0} /></linearGradient>
                <linearGradient id="igGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#254C94" stopOpacity={0.1} /><stop offset="95%" stopColor="#254C94" stopOpacity={0} /></linearGradient>
                <linearGradient id="xGrad"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06B6D4" stopOpacity={0.1} /><stop offset="95%" stopColor="#06B6D4" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.surfaceBorder} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.textMuted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${T.surfaceBorder}`, boxShadow: T.surfaceShadowMd }} />
              <Area type="monotone" dataKey="fb" stroke="#00A589" strokeWidth={2} fill="url(#fbGrad)" dot={{ r: 3, fill: "#00A589", strokeWidth: 0 }} />
              <Area type="monotone" dataKey="ig" stroke="#254C94" strokeWidth={2} fill="url(#igGrad)" dot={{ r: 3, fill: "#254C94", strokeWidth: 0 }} />
              <Area type="monotone" dataKey="x"  stroke="#06B6D4" strokeWidth={2} fill="url(#xGrad)"  dot={{ r: 3, fill: "#06B6D4", strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: T.surfaceBg, border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: "18px 20px", boxShadow: T.surfaceShadow }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 14 }}>Engagement by Channel</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={ENG_DATA} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.surfaceBorder} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: T.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
              <YAxis type="category" dataKey="channel" tick={{ fontSize: 10, fill: T.textSecondary }} axisLine={false} tickLine={false} width={70} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${T.surfaceBorder}` }} />
              <Bar dataKey="value" fill={T.accent} radius={[0, 4, 4, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Suggestions */}
      <div style={{ background: T.surfaceBg, border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.surfaceBorder}`, background: "linear-gradient(90deg,#E0FAF5,#E8EDF6)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg,#00A589,#254C94)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>✨</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>Suggestions to improve your Rules</span>
        </div>
        {ANALYTICS_SUGGESTIONS.map((s, i) => (
            <div key={i} style={{ padding: "14px 18px", borderBottom: i < ANALYTICS_SUGGESTIONS.length - 1 ? "1px solid #EDF2F7" : "none", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: T.accentLight, border: `1px solid ${T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>↗</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: T.textPrimary, lineHeight: 1.55, marginBottom: 5 }}>{s.text}</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>From: {s.campaign}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => navigate("/rules")} style={{ padding: "4px 10px", background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}`, borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Accept</button>
              <button style={{ padding: "4px 10px", background: "transparent", color: T.textSecondary, border: "1px solid transparent", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Reject</button>
            </div>
          </div>
        ))}
      </div>

      {/* Top / Bottom performers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { title: "Top Performing", items: ANALYTICS_TOP },
          { title: "Needs Attention", items: ANALYTICS_BOTTOM },
        ].map(({ title, items }) => (
          <div key={title} style={{ background: T.surfaceBg, border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, overflow: "hidden", boxShadow: T.surfaceShadow }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.surfaceBorder}`, fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{title}</div>
            {items.map((row, i) => {
              const [t, ch, m, u] = row
              return (
                <div key={i} style={{ padding: "11px 16px", borderBottom: i < items.length - 1 ? "1px solid #EDF2F7" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 44, height: 32, borderRadius: 5, flexShrink: 0, background: "repeating-linear-gradient(135deg,#EDF2F7,#EDF2F7 6px,#EDE9E1 6px,#EDE9E1 12px)", border: `1px solid ${T.surfaceBorder}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{ch}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: u ? T.green : T.red, display: "flex", alignItems: "center", gap: 3 }}>{u ? "▲" : "▼"} {m}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
