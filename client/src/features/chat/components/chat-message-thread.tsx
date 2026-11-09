import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { AgentStep, ChatMessage } from "@/shared/services/chat.service"
import { ChatAssistantAvatar } from "./chat-assistant-avatar"
import { ChatEmptyState } from "./chat-empty-state"
import { ChatMessageBubble } from "./chat-message-bubble"
import { ChatStepAccordion } from "./chat-step-accordion"
import { findRunReportId } from "../lib/chat-run-progress"
import { chatDayKey, chatDayLabel } from "../lib/chat-message-pages"

/** Within this many px of the bottom counts as "reading the latest". */
const NEAR_BOTTOM_PX = 120
/** Within this many px of the top starts loading the previous page. */
const NEAR_TOP_PX = 200

type ChatMessageThreadProps = {
  messages: ChatMessage[]
  isLoading: boolean
  isSending: boolean
  liveSteps: AgentStep[]
  onRequestUpload?: () => void
  onStartRednoteQr?: (socketRoom: string) => void
  onChoose?: (text: string) => void
  /** Older history exists on the server. */
  hasOlder?: boolean
  isLoadingOlder?: boolean
  onLoadOlder?: () => void
  /** Messages from older pages: run cards render collapsed, without live updates. */
  historicalIds?: Set<string>
  brandName?: string
}

function DayDivider({ iso }: { iso: string }) {
  const { t, i18n } = useTranslation("chat")
  const label = chatDayLabel(iso, i18n.language)
  const text = label.kind === "date" ? label.text : t(`history.${label.kind}`)
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={text}>
      <span className="h-px flex-1 bg-canvas-200 dark:bg-white/8" />
      <span className="text-[11.5px] font-medium text-canvas-500 dark:text-navy-200">{text}</span>
      <span className="h-px flex-1 bg-canvas-200 dark:bg-white/8" />
    </div>
  )
}

function OlderSkeleton() {
  const { t } = useTranslation("chat")
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("history.loadingEarlier")}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-2xl bg-canvas-200/60 dark:bg-white/5"
          style={{ width: i === 1 ? "40%" : "58%", marginLeft: i === 1 ? "auto" : 0 }}
        />
      ))}
    </div>
  )
}

export function ChatMessageThread({
  messages,
  isLoading,
  isSending,
  liveSteps,
  onRequestUpload,
  onStartRednoteQr,
  onChoose,
  hasOlder = false,
  isLoadingOlder = false,
  onLoadOlder,
  historicalIds,
  brandName,
}: ChatMessageThreadProps) {
  const { t } = useTranslation("chat")
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const lastIdRef = useRef<string | undefined>(messages[messages.length - 1]?.messageId)
  /** Scroll metrics captured right before older messages are prepended. */
  const anchorRef = useRef<{ height: number; top: number; firstId?: string } | null>(null)
  const [readyPill, setReadyPill] = useState(false)
  const [showJump, setShowJump] = useState(false)

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    setReadyPill(false)
    setShowJump(false)
  }

  // Keep the reading position when older messages land above it.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = anchorRef.current
    if (!el || !anchor) return
    if (messages[0]?.messageId === anchor.firstId) return
    el.scrollTop = el.scrollHeight - anchor.height + anchor.top
    anchorRef.current = null
  }, [messages])

  useEffect(() => {
    const lastId = messages[messages.length - 1]?.messageId
    const prevLastId = lastIdRef.current
    lastIdRef.current = lastId
    const tailChanged = lastId !== prevLastId
    // Prepended history doesn't change the tail - never yank the user to the bottom for it.
    if (!tailChanged && !isSending) return
    const prevIndex = prevLastId ? messages.findIndex((m) => m.messageId === prevLastId) : -1
    const added = messages.slice(prevIndex + 1)
    const reportArrived = added.some((m) => m.role === "assistant" && findRunReportId(m.steps))
    // Only follow new output when the user is already at the bottom (or sending themselves).
    if (nearBottomRef.current || isSending) {
      bottomRef.current?.scrollIntoView({ behavior: tailChanged && prevLastId ? "smooth" : "auto" })
    } else if (reportArrived) {
      setReadyPill(true)
    }
  }, [messages, isSending, liveSteps.length])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    setShowJump(!nearBottomRef.current)
    if (nearBottomRef.current) setReadyPill(false)
    if (el.scrollTop < NEAR_TOP_PX && hasOlder && !isLoadingOlder && onLoadOlder && !anchorRef.current) {
      anchorRef.current = { height: el.scrollHeight, top: el.scrollTop, firstId: messages[0]?.messageId }
      onLoadOlder()
    }
  }

  // A fetch that finished without new rows (or failed) must not leave a stale anchor behind.
  useEffect(() => {
    if (!isLoadingOlder && anchorRef.current && messages[0]?.messageId === anchorRef.current.firstId) {
      const id = window.setTimeout(() => {
        if (anchorRef.current && messages[0]?.messageId === anchorRef.current.firstId) anchorRef.current = null
      }, 0)
      return () => window.clearTimeout(id)
    }
  }, [isLoadingOlder, messages])

  if (isLoading && messages.length === 0 && !isSending) {
    return (
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-6" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-14 w-2/3 animate-pulse rounded-2xl bg-muted/50"
            style={{ marginLeft: i % 2 === 0 ? 0 : "auto" }}
          />
        ))}
      </div>
    )
  }

  if (messages.length === 0 && !isSending) {
    return <ChatEmptyState variant="no-messages" />
  }

  const isWaitingForAssistant =
    isSending &&
    (messages.length === 0 || messages[messages.length - 1]?.role === "user")

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div ref={scrollRef} onScroll={handleScroll} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-6 py-6">
      {isLoadingOlder ? <OlderSkeleton /> : null}
      {!hasOlder && !isLoadingOlder && messages.length > 0 ? (
        <p className="py-1 text-center text-[12px] text-canvas-500 dark:text-navy-200">
          {brandName ? t("history.startOfChat", { brand: brandName }) : t("history.startOfChatGeneric")}
        </p>
      ) : null}
      {messages.map((message, index) => {
        const hasUserReplyAfter = messages.slice(index + 1).some((m) => m.role === "user")
        const prev = messages[index - 1]
        const newDay = !prev || chatDayKey(prev.createdAt) !== chatDayKey(message.createdAt)
        return (
          <Fragment key={message.messageId}>
            {newDay ? <DayDivider iso={message.createdAt} /> : null}
            <ChatMessageBubble
              message={message}
              onRequestUpload={onRequestUpload}
              onStartRednoteQr={onStartRednoteQr}
              onChoose={onChoose}
              askUserDisabled={isSending || hasUserReplyAfter}
              isLatest={!isSending && !hasUserReplyAfter && index === messages.length - 1}
              historical={historicalIds?.has(message.messageId)}
            />
          </Fragment>
        )
      })}
      {isWaitingForAssistant ? (
        <div className="flex w-full items-start gap-2" aria-busy="true">
          <ChatAssistantAvatar />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            {liveSteps.length > 0 ? (
              <ChatStepAccordion
                steps={liveSteps}
                onRequestUpload={onRequestUpload}
                onStartRednoteQr={onStartRednoteQr}
                embedCards
              />
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </span>
                {t("composer.thinking")}
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
      {readyPill ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_8px_20px_rgba(15,31,61,0.25)] dark:bg-teal-400 dark:text-navy-700 dark:shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
        >
          {t("runCard.readyPill")}
          <ArrowDown className="size-3.5" aria-hidden />
        </button>
      ) : showJump ? (
        // The ready pill already jumps to the latest, so only one of the two shows at a time.
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={t("history.jumpToLatest")}
          title={t("history.jumpToLatest")}
          className="absolute right-5 bottom-3 inline-flex size-9 items-center justify-center rounded-full border border-canvas-200 bg-white text-navy-700 shadow-[0_6px_16px_rgba(15,31,61,0.15)] hover:bg-canvas-100 dark:border-white/10 dark:bg-navy-800 dark:text-[#E8EDF6] dark:shadow-[0_6px_16px_rgba(0,0,0,0.45)] dark:hover:bg-navy-700"
        >
          <ArrowDown className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
