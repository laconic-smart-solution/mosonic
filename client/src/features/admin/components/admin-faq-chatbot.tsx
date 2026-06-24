import { useEffect, useId, useRef, useState } from "react"
import { MessageCircle, Send, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"

import { useAdminFaqAsk } from "../hooks/use-admin-faq"
import type { FaqAskResponse } from "../types/faq.types"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  meta?: FaqAskResponse
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function AdminFaqChatbot() {
  const { t } = useTranslation("admin")
  const panelId = useId()
  const inputId = useId()
  const titleId = useId()
  const fabRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const ask = useAdminFaqAsk()

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
            },
          ])
        },
        onError: (error) => toastApiError(error, "admin:faq.chat.error"),
      },
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
                {t("faq.chat.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("faq.chat.subtitle")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label={t("faq.chat.close")}
              onClick={() => {
                setOpen(false)
                fabRef.current?.focus()
              }}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("faq.chat.empty")}</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-3 py-2 text-sm",
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.meta ? (
                    <div className="mt-2 space-y-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`faq.chat.source.${message.meta.source}`)}
                      </Badge>
                      {message.meta.matched_sources.length > 0 ? (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium">
                            {t("faq.chat.sources")}
                          </summary>
                          <ul className="mt-1 space-y-1">
                            {message.meta.matched_sources.map((source) => (
                              <li key={`${source.document_id}-${source.chunk_index}`}>
                                {source.filename} #{source.chunk_index}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
            {ask.isPending ? (
              <p className="text-xs text-muted-foreground">{t("faq.chat.thinking")}</p>
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
              {t("faq.chat.inputLabel")}
            </label>
            <Input
              ref={inputRef}
              id={inputId}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("faq.chat.placeholder")}
              disabled={ask.isPending}
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0"
              disabled={ask.isPending || !question.trim()}
              aria-label={t("faq.chat.send")}
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
        aria-label={t("faq.chat.toggle")}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle className="size-6" aria-hidden />
      </Button>
    </div>
  )
}
