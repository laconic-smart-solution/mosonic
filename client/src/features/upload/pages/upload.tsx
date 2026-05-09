import axios from "axios"
import type { ReactNode } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"

import { T } from "@/lib/tokens"
import {
  useGetUploadQuery,
  usePublishUploadMutation,
} from "@/shared/queries/upload.query"
import type { UploadChannelRow } from "@/shared/types/upload.type"

function Chip({
  label,
  color = "gray",
  dot = false,
  size = "xs",
}: {
  label: string
  color?: string
  dot?: boolean
  size?: string
}) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    gray: { bg: "#EDF2F7", text: "#4A5568", border: "#D9E1EC" },
    indigo: { bg: T.accentLight, text: T.accent, border: T.accentBorder },
    green: { bg: T.greenBg, text: T.green, border: T.greenBorder },
    amber: { bg: T.amberBg, text: T.amber, border: T.amberBorder },
    red: { bg: T.redBg, text: T.red, border: T.redBorder },
  }
  const c = map[color] ?? map.gray
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: size === "xs" ? "2px 7px" : "3px 9px",
        borderRadius: 20,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: c.text,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  )
}

function Btn({
  children,
  variant = "primary",
  size = "xs",
  onClick,
  disabled,
  style: ex = {},
}: {
  children: ReactNode
  variant?: string
  size?: string
  onClick?: () => void
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const vs: Record<string, React.CSSProperties> = {
    primary: { background: T.accent, color: "white" },
    secondary: {
      background: "white",
      color: T.textPrimary,
      border: `1px solid ${T.surfaceBorder}`,
    },
    ghost: {
      background: "transparent",
      color: T.textSecondary,
      border: "1px solid transparent",
    },
  }
  const sizes: Record<string, React.CSSProperties> = {
    xs: { padding: "4px 10px", fontSize: 11 },
    sm: { padding: "6px 13px", fontSize: 12 },
    md: { padding: "8px 16px", fontSize: 13 },
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        fontWeight: 600,
        whiteSpace: "nowrap",
        border: "none",
        outline: "none",
        opacity: disabled ? 0.6 : 1,
        ...(vs[variant] ?? vs.primary),
        ...(sizes[size] ?? sizes.xs),
        ...ex,
      }}
    >
      {children}
    </button>
  )
}

const CHANNEL_STATUS_UI: Record<
  string,
  { label: string; color: string }
> = {
  pending: { label: "Pending", color: "amber" },
  scheduled: { label: "Scheduled", color: "indigo" },
  published: { label: "Published", color: "green" },
  failed: { label: "Failed", color: "red" },
}

function channelAccent(channel: string): string {
  const key = channel.toLowerCase()
  if (key.includes("instagram")) return "#E4405F"
  if (key.includes("facebook")) return "#1877F2"
  if (key.includes("linkedin")) return "#0A66C2"
  if (key.includes("twitter") || key === "x") return "#000000"
  return T.accent
}

function previewCaption(ro: {
  text?: string
  translatedText?: string
  summary?: string
}): string {
  return (
    (ro.text?.trim() && ro.text) ||
    (ro.translatedText?.trim() && ro.translatedText) ||
    (ro.summary?.trim() && ro.summary) ||
    "—"
  )
}

function channelLabel(id: string): string {
  if (!id) return ""
  return id.charAt(0).toUpperCase() + id.slice(1)
}

function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined
    if (typeof data?.message === "string") return data.message
    if (Array.isArray(data?.message)) return data.message.join(", ")
  }
  if (err instanceof Error) return err.message
  return "Something went wrong"
}

function activityLines(channels: UploadChannelRow[]): ReactNode {
  const lines = channels.filter((c) => c.status === "published")
  if (lines.length === 0) {
    return (
      <span style={{ color: T.textMuted }}>
        No publishes yet — use Publish all now to post via Zernio.
      </span>
    )
  }
  return lines.map((c) => (
    <span
      key={c.channel}
      style={{
        color: T.green,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: T.green,
          display: "inline-block",
        }}
      />
      {channelLabel(c.channel)} published
    </span>
  ))
}

export default function UploadPage() {
  const { uploadId } = useParams<{ uploadId?: string }>()
  const uploadQuery = useGetUploadQuery(uploadId)
  const publishMutation = usePublishUploadMutation()

  const data = uploadQuery.data
  const caption = data ? previewCaption(data.resolvedOutputs) : "—"
  const imageUrl = data?.resolvedOutputs.image?.trim()
  const hasPendingOrFailed =
    data?.channels.some(
      (c) => c.status === "pending" || c.status === "failed"
    ) ?? false

  function publishAll() {
    if (!uploadId) return
    publishMutation.mutate(uploadId, {
      onSuccess: (res) => {
        if (res.skipped) {
          toast.message(res.message)
        } else {
          toast.success("Published to connected accounts.")
        }
      },
      onError: (err) => {
        toast.error(getApiErrorMessage(err))
      },
    })
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: T.textPrimary,
              letterSpacing: "-0.5px",
            }}
          >
            Upload & Publish
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: T.textSecondary,
            }}
          >
            Preview content per channel, then publish through Zernio MCP.
          </p>
          {uploadId ? (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12,
                color: T.textSecondary,
              }}
            >
              Upload job:{" "}
              <code style={{ fontSize: 11 }}>{uploadId}</code>
            </p>
          ) : (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12,
                color: T.textMuted,
              }}
            >
              Approve content from the content detail page to open an upload
              job here.
            </p>
          )}
        </div>

        {!uploadId ? null : uploadQuery.isLoading ? (
          <div style={{ fontSize: 13, color: T.textSecondary }}>
            Loading upload…
          </div>
        ) : uploadQuery.isError ? (
          <div style={{ fontSize: 13, color: T.red }}>
            {getApiErrorMessage(uploadQuery.error)}
          </div>
        ) : data ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              {data.channels.map((ch) => {
                const sm =
                  CHANNEL_STATUS_UI[ch.status] ?? CHANNEL_STATUS_UI.pending
                const color = channelAccent(ch.channel)
                return (
                  <div
                    key={ch.channel}
                    style={{
                      background: "white",
                      border: `1px solid ${T.surfaceBorder}`,
                      borderRadius: 10,
                      overflow: "hidden",
                      boxShadow: T.surfaceShadow,
                    }}
                  >
                    <div
                      style={{
                        padding: "11px 14px",
                        borderBottom: `1px solid ${T.surfaceBorder}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: color + "18",
                          border: `1.5px solid ${color}40`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          color,
                          flexShrink: 0,
                        }}
                      >
                        {ch.channel.slice(0, 1).toUpperCase()}
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: T.textPrimary,
                          flex: 1,
                        }}
                      >
                        {channelLabel(ch.channel)}
                      </span>
                      <Chip label={sm.label} color={sm.color} dot />
                    </div>

                    <div style={{ padding: 12, background: "#EDF2F7" }}>
                      <div
                        style={{
                          background: "white",
                          borderRadius: 10,
                          border: `1px solid ${T.surfaceBorder}`,
                          overflow: "hidden",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                        }}
                      >
                        <div
                          style={{
                            padding: "9px 11px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            borderBottom: `1px solid ${T.surfaceBorder}`,
                          }}
                        >
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg,#00A589,#254C94)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "white",
                              flexShrink: 0,
                            }}
                          >
                            NT
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: T.textPrimary,
                              }}
                            >
                              NeuralTex
                            </div>
                            <div
                              style={{ fontSize: 10, color: T.textMuted }}
                            >
                              Preview
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            padding: "9px 11px",
                            fontSize: 12,
                            color: T.textPrimary,
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {caption}
                        </div>
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt=""
                            style={{
                              width: "100%",
                              maxHeight: 200,
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              background:
                                "repeating-linear-gradient(135deg,#EDF2F7,#EDF2F7 6px,#EDE9E1 6px,#EDE9E1 12px)",
                              height: 100,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              color: "#718096",
                              fontFamily: "ui-monospace,monospace",
                            }}
                          >
                            [no image in resolved outputs]
                          </div>
                        )}
                        <div
                          style={{
                            padding: "8px 11px",
                            display: "flex",
                            gap: 14,
                            borderTop: `1px solid ${T.surfaceBorder}`,
                          }}
                        >
                          {["Like", "Comment", "Share"].map((a) => (
                            <span
                              key={a}
                              style={{
                                fontSize: 11,
                                color: T.textMuted,
                                fontWeight: 500,
                              }}
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "10px 14px",
                        borderTop: `1px solid ${T.surfaceBorder}`,
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {ch.failureReason ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: T.red,
                            flex: "1 1 100%",
                          }}
                        >
                          {ch.failureReason}
                        </span>
                      ) : null}
                      <div style={{ marginLeft: "auto" }}>
                        {ch.status === "published" ? (
                          <Chip label="Published" color="green" dot />
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              color: T.textMuted,
                            }}
                          >
                            Use Publish all in the sidebar
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div
              style={{
                marginTop: 16,
                background: "white",
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 11,
                color: T.textSecondary,
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
                boxShadow: T.surfaceShadow,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: T.textPrimary,
                  fontSize: 11,
                }}
              >
                Activity
              </span>
              {activityLines(data.channels)}
            </div>
          </>
        ) : null}
      </div>

      <div
        style={{
          width: 236,
          minWidth: 236,
          borderLeft: `1px solid ${T.surfaceBorder}`,
          background: "white",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 16,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            background: "white",
            border: `1px solid ${T.surfaceBorder}`,
            borderRadius: 10,
            padding: 16,
            boxShadow: T.surfaceShadow,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.textPrimary,
              marginBottom: 12,
            }}
          >
            Bulk Actions
          </div>
          <Btn
            variant="primary"
            size="md"
            style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}
            disabled={
              !uploadId ||
              !data ||
              !hasPendingOrFailed ||
              publishMutation.isPending
            }
            onClick={publishAll}
          >
            {publishMutation.isPending ? "Publishing…" : "Publish all now"}
          </Btn>
          <Btn
            variant="secondary"
            size="md"
            style={{ width: "100%", justifyContent: "center" }}
            disabled
          >
            Schedule all (soon)
          </Btn>
        </div>

        {data ? (
          <div
            style={{
              background: "white",
              border: `1px solid ${T.surfaceBorder}`,
              borderRadius: 10,
              padding: 14,
              boxShadow: T.surfaceShadow,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.textPrimary,
                marginBottom: 10,
              }}
            >
              Channels in this upload
            </div>
            {data.channels.map((ch) => (
              <div
                key={ch.channel}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: T.textPrimary,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: channelAccent(ch.channel),
                      fontWeight: 700,
                    }}
                  >
                    {ch.channel.slice(0, 1).toUpperCase()}
                  </span>
                  {channelLabel(ch.channel)}
                </span>
                <Chip
                  label={
                    (CHANNEL_STATUS_UI[ch.status] ?? CHANNEL_STATUS_UI.pending)
                      .label
                  }
                  color={
                    (CHANNEL_STATUS_UI[ch.status] ?? CHANNEL_STATUS_UI.pending)
                      .color
                  }
                />
              </div>
            ))}
          </div>
        ) : null}

        {uploadId && data && caption === "—" ? (
          <div
            style={{
              background: "#FEF3C7",
              border: "1px solid #FCD34D",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#92400E",
                marginBottom: 5,
              }}
            >
              Caption missing
            </div>
            <div style={{ fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>
              Add text, translation, or summary on the content before approve —
              publish requires caption text.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
