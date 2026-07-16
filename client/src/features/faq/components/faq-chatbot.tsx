import { useEffect, useId, useRef, useState } from "react"
import { MessageCircle, Send, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"
import { useFaqAskMutation } from "@/shared/queries/faq.query"
import type { FaqAskResponse } from "@/shared/types/faq.type"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  meta?: FaqAskResponse
  /** When true, reveal assistant text with a typewriter effect once. */
  animate?: boolean
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function TypingText({
  text,
  active,
  onDone,
  onProgress,
}: {
  text: string
  active: boolean
  onDone?: () => void
  onProgress?: () => void
}) {
  const [shown, setShown] = useState(active ? "" : text)
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  const onProgressRef = useRef(onProgress)
  onDoneRef.current = onDone
  onProgressRef.current = onProgress

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setShown(text)
      if (!doneRef.current) {
        doneRef.current = true
        onDoneRef.current?.()
      }
      return
    }

    doneRef.current = false
    setShown("")
    let index = 0
    const step = Math.max(1, Math.ceil(text.length / 80))
    const id = window.setInterval(() => {
      index = Math.min(text.length, index + step)
      setShown(text.slice(0, index))
      onProgressRef.current?.()
      if (index >= text.length) {
        window.clearInterval(id)
        if (!doneRef.current) {
          doneRef.current = true
          onDoneRef.current?.()
        }
      }
    }, 28)

    return () => window.clearInterval(id)
  }, [text, active])

  const typing = active && shown.length < text.length

  return (
    <p className="whitespace-pre-wrap">
      {shown}
      {typing ? (
        <span
          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-foreground/70"
          aria-hidden
        />
      ) : null}
    </p>
  )
}

export function FaqChatbot() {
  const { t } = useTranslation("faq")
  const panelId = useId()
  const inputId = useId()
  const titleId = useId()
  const fabRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const ask = useFaqAskMutation()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        fabRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 50)
      return () => window.clearTimeout(timer)
    }
  }, [open])

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, ask.isPending])

  const send = () => {
    const trimmed = question.trim()
    if (!trimmed || ask.isPending) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    }
    setMessages((prev) => [...prev, userMessage])
    setQuestion("")

    ask.mutate(
      { question: trimmed },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: data.answer,
              meta: data,
              animate: true,
            },
          ])
        },
        onError: (error) => toastApiError(error, "faq:chat.error"),
      },
    )
  }

  const markTyped = (id: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id ? { ...message, animate: false } : message,
      ),
    )
  }

  const motionClass = prefersReducedMotion()
    ? ""
    : "transition-transform duration-200 data-[state=open]:scale-100 data-[state=closed]:scale-95"

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-state="open"
          className={cn(
            "pointer-events-auto flex h-[min(32rem,70dvh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl",
            motionClass,
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 id={titleId} className="text-sm font-semibold">
                {t("chat.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("chat.subtitle")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label={t("chat.close")}
              onClick={() => {
                setOpen(false)
                fabRef.current?.focus()
              }}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("chat.empty")}</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex w-full",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "w-fit max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-sm break-words",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                  {message.role === "assistant" ? (
                    <TypingText
                      text={message.content}
                      active={Boolean(message.animate)}
                      onDone={() => markTyped(message.id)}
                      onProgress={scrollToBottom}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                  {message.role === "assistant" && message.meta ? (
                    <div className="mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`chat.source.${message.meta.source}`)}
                      </Badge>
                    </div>
                  ) : null}
                  </div>
                </div>
              ))
            )}
            {ask.isPending ? (
              <p className="text-xs text-muted-foreground">{t("chat.thinking")}</p>
            ) : null}
          </div>

          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {t("chat.inputLabel")}
            </label>
            <Input
              ref={inputRef}
              id={inputId}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("chat.placeholder")}
              disabled={ask.isPending}
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0"
              disabled={ask.isPending || !question.trim()}
              aria-label={t("chat.send")}
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      ) : null}

      <Button
        ref={fabRef}
        type="button"
        size="icon"
        className="pointer-events-auto size-14 rounded-full shadow-lg"
        aria-label={t("chat.toggle")}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle className="size-6" aria-hidden />
      </Button>
    </div>
  )
}
