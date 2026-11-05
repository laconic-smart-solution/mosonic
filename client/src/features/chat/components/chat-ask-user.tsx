import { ChatPlanLines } from "./chat-plan-lines"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CircleHelp, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { AskUserPrompt } from "../lib/parse-ask-user"
import { displayAskUserPrompt, formatAskUserChoice, normalizeUserUrl, optionNeedsUrl } from "../lib/parse-ask-user"

function AskUserNotice({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  )
}

export function ChatAskUser({
  prompt,
  disabled,
  onChoose,
}: {
  prompt: AskUserPrompt
  disabled?: boolean
  onChoose: (text: string) => void
}) {
  const { t } = useTranslation("chat")
  const shown = displayAskUserPrompt(prompt, t)
  const [selected, setSelected] = useState<string[]>([])
  /** Option waiting for its URL (inputType "url"), shown as a field inside the card. */
  const [urlOptionId, setUrlOptionId] = useState<string | null>(null)
  const [urlValue, setUrlValue] = useState("")
  const [urlTouched, setUrlTouched] = useState(false)

  function send(ids: string[], input?: string) {
    if (disabled || ids.length === 0) return
    onChoose(formatAskUserChoice(prompt, ids, input))
  }

  const normalizedUrl = normalizeUserUrl(urlValue)
  const urlOption = urlOptionId ? prompt.options.find((option) => option.id === urlOptionId) : undefined

  function submitUrl() {
    setUrlTouched(true)
    if (!urlOption || !normalizedUrl) return
    send([urlOption.id], normalizedUrl)
  }

  if (prompt.type === "multi") {
    return (
      <div className="w-full min-w-0 space-y-2.5 rounded-2xl border border-amber-400 bg-amber-50 dark:bg-amber-400/10 px-3.5 py-3">
        <p className="flex min-w-0 items-start gap-2 text-sm font-semibold break-words text-navy-700 dark:text-[#E8EDF6]">
          <CircleHelp className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          <span className="min-w-0">{shown.question}</span>
        </p>
        {prompt.notice ? <AskUserNotice text={prompt.notice} /> : null}
      {prompt.plan ? <ChatPlanLines plan={prompt.plan} /> : null}
        <div className="flex flex-wrap gap-1.5">
          {prompt.options.map((option) => {
            const isOn = selected.includes(option.id)
            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "rounded-full border-canvas-300 dark:border-white/14 bg-white dark:bg-navy-700 text-navy-700 dark:text-[#E8EDF6]",
                  isOn && "border-navy-700 dark:border-teal-400 bg-navy-700 dark:bg-teal-400 text-white dark:text-navy-700 hover:bg-navy-600 dark:hover:bg-teal-300 hover:text-white dark:hover:text-navy-700",
                )}
                disabled={disabled}
                aria-pressed={isOn}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(option.id)
                      ? prev.filter((id) => id !== option.id)
                      : [...prev, option.id],
                  )
                }
              >
                {shown.options.find((o) => o.id === option.id)?.label ?? option.label}
              </Button>
            )
          })}
        </div>
        <Button
          type="button"
          size="sm"
          className={cn("rounded-full bg-navy-700 dark:bg-teal-400 text-white dark:text-navy-700 hover:bg-navy-600 dark:hover:bg-teal-300", disabled && "opacity-50")}
          disabled={disabled || selected.length === 0}
          onClick={() => send(selected)}
        >
          {t("askUser.confirm")}
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 space-y-2.5 rounded-2xl border border-amber-400 bg-amber-50 dark:bg-amber-400/10 px-3.5 py-3">
      <p className="flex min-w-0 items-start gap-2 text-sm font-semibold break-words text-navy-700 dark:text-[#E8EDF6]">
          <CircleHelp className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          <span className="min-w-0">{shown.question}</span>
        </p>
      {prompt.notice ? <AskUserNotice text={prompt.notice} /> : null}
      {prompt.plan ? <ChatPlanLines plan={prompt.plan} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {prompt.options.map((option) => {
          const needsUrl = optionNeedsUrl(option)
          const isOpen = urlOptionId === option.id
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "rounded-full border-canvas-300 dark:border-white/14 bg-white dark:bg-navy-700 text-navy-700 dark:text-[#E8EDF6] hover:border-navy-700 dark:hover:border-teal-400 hover:bg-navy-700 hover:text-white dark:hover:text-navy-700",
                isOpen && "border-navy-700 dark:border-teal-400 bg-navy-700 dark:bg-teal-400 text-white dark:text-navy-700",
              )}
              disabled={disabled}
              aria-pressed={needsUrl ? isOpen : undefined}
              onClick={() => {
                if (needsUrl) {
                  setUrlOptionId(isOpen ? null : option.id)
                  setUrlTouched(false)
                  return
                }
                send([option.id])
              }}
            >
              {shown.options.find((o) => o.id === option.id)?.label ?? option.label}
            </Button>
          )
        })}
      </div>
      {urlOption ? (
        <form
          className="flex flex-col gap-1.5 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            submitUrl()
          }}
        >
          <div className="flex-1 space-y-1">
            <Input
              type="url"
              inputMode="url"
              autoFocus
              value={urlValue}
              placeholder={t("askUser.urlPlaceholder")}
              aria-label={t("askUser.urlLabel")}
              aria-invalid={urlTouched && !normalizedUrl}
              disabled={disabled}
              className="h-8 rounded-[9px] border-canvas-300 dark:border-white/14 bg-white dark:bg-navy-700 text-sm"
              onChange={(e) => setUrlValue(e.target.value)}
            />
            {urlTouched && !normalizedUrl ? (
              <p className="text-[11px] text-[#D64545]">{t("askUser.urlInvalid")}</p>
            ) : null}
          </div>
          <Button
            type="submit"
            size="sm"
            className="rounded-[9px] bg-navy-700 dark:bg-teal-400 text-white dark:text-navy-700 hover:bg-navy-600 dark:hover:bg-teal-300"
            disabled={disabled || !urlValue.trim()}
          >
            {t("askUser.continue")}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
