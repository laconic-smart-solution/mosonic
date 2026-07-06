import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowRight,
  ArrowUp,
  Upload,
  Link as LinkIcon,
  Image as ImageIcon,
  X,
  FileText,
  Globe,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { randomUuid } from "@/lib/random-uuid"

export interface Attachment {
  id: string
  type: "file" | "url"
  label: string
  data?: File | string
}

export interface PromptAreaProps {
  placeholder?: string
  maxLength?: number
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (text: string, attachments: Attachment[]) => void
  onFocus?: () => void
  onBlur?: () => void
  onAttachmentsChange?: (attachments: Attachment[]) => void
  enableFiles?: boolean
  enableUrls?: boolean
  enableImages?: boolean
  acceptFileTypes?: string
  className?: string
  /** Disables typing and submit. */
  disabled?: boolean
  /** Disables submit only; typing stays enabled when `disabled` is false. */
  submitDisabled?: boolean
}

export function PromptArea({
  placeholder = "Describe what you want to generate…",
  maxLength = 4000,
  value: controlledValue,
  onChange,
  onSubmit,
  onFocus,
  onBlur,
  onAttachmentsChange,
  enableFiles = true,
  enableUrls = true,
  enableImages = true,
  acceptFileTypes = ".pdf,.docx,.txt,.md",
  className,
  disabled = false,
  submitDisabled,
}: PromptAreaProps) {
  const submitLocked = disabled || (submitDisabled ?? false)
  const [expanded, setExpanded] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState("")
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [urlOpen, setUrlOpen] = React.useState(false)
  const [urlValue, setUrlValue] = React.useState("")

  const value = controlledValue ?? internalValue
  const containerRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const hasContent = value.trim().length > 0 || attachments.length > 0

  const getTextareaMaxHeight = React.useCallback(() => {
    if (typeof window === "undefined") return 200
    return window.matchMedia("(max-width: 639px)").matches ? 128 : 200
  }, [])

  const focusTextarea = React.useCallback(() => {
    if (disabled) return
    setExpanded(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [disabled])

  React.useEffect(() => {
    if (value.trim().length > 0) setExpanded(true)
  }, [value])

  const setValue = (v: string) => {
    if (onChange) onChange(v)
    else setInternalValue(v)
  }

  React.useEffect(() => {
    onAttachmentsChange?.(attachments)
  }, [attachments, onAttachmentsChange])

  React.useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const maxHeight = getTextareaMaxHeight()
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, expanded, getTextareaMaxHeight])

  React.useEffect(() => {
    function handleOutside(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setUrlOpen(false)
        if (!hasContent) setExpanded(false)
      }
    }
    document.addEventListener("pointerdown", handleOutside)
    return () => document.removeEventListener("pointerdown", handleOutside)
  }, [hasContent])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setValue("")
      setAttachments([])
      setExpanded(false)
      textareaRef.current?.blur()
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!submitLocked) submit()
    }
  }

  function submit() {
    if (submitLocked || !hasContent) return
    onSubmit?.(value, attachments)
    setValue("")
    setAttachments([])
    setExpanded(false)
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    const next: Attachment[] = Array.from(files).map((f) => ({
      id: randomUuid(),
      type: "file",
      label: f.name,
      data: f,
    }))
    setAttachments((prev) => [...prev, ...next])
  }

  function addUrl() {
    const cleaned = urlValue
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
    if (!cleaned) return
    setAttachments((prev) => [
      ...prev,
      {
        id: randomUuid(),
        type: "url",
        label: cleaned,
        data: urlValue.trim(),
      },
    ])
    setUrlValue("")
    setUrlOpen(false)
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const fileCount = attachments.filter((a) => a.type === "file").length
  const urlCount = attachments.filter((a) => a.type === "url").length

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full overflow-hidden border bg-card transition-[border-radius,border-color] duration-200 ease-out",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-text",
        expanded
          ? "rounded-2xl border-teal-400"
          : "rounded-2xl border-border sm:rounded-full hover:border-muted-foreground/40",
        className
      )}
      onPointerDownCapture={(e) => {
        if (disabled) return
        e.stopPropagation()
        focusTextarea()
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptFileTypes}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
        className="hidden"
      />

      <AnimatePresence initial={false}>
        {expanded && attachments.length > 0 && (
          <motion.div
            key="chips"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 px-3 pt-3 sm:px-4">
              {attachments.map((att) => (
                <motion.span
                  key={att.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                    att.type === "file"
                      ? "border-teal-700/20 bg-teal-50 text-teal-700"
                      : "border-navy-700/20 bg-navy-100/40 text-foreground"
                  )}
                >
                  {att.type === "file" ? (
                    <FileText className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  <span className="max-w-[calc(100vw-6rem)] truncate sm:max-w-[200px]">
                    {att.label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeAttachment(att.id)
                    }}
                    className="-m-1 rounded-full p-1 opacity-50 transition-opacity hover:opacity-100 touch-manipulation"
                    aria-label={`Remove ${att.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && urlOpen && (
          <motion.div
            key="url-row"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="flex flex-col gap-2 px-3 pt-3 sm:flex-row sm:items-center sm:gap-1.5 sm:px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addUrl()
                    }
                    if (e.key === "Escape") {
                      setUrlOpen(false)
                      setUrlValue("")
                    }
                  }}
                  placeholder="https://example.com"
                  autoFocus
                  className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-2 text-base outline-none transition-colors focus:border-teal-400 sm:py-1.5 sm:text-sm"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={addUrl}
                  className="min-h-10 rounded-md bg-navy-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-navy-500 touch-manipulation sm:min-h-0 sm:py-1.5"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrlOpen(false)
                    setUrlValue("")
                  }}
                  className="min-h-10 rounded-md border border-border px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-muted touch-manipulation sm:min-h-0 sm:py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "flex w-full items-end sm:items-center",
          expanded ? "px-3 pb-2 pt-3 sm:px-4" : "min-h-[52px] pl-4 pr-1.5 sm:pl-5"
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Save workflow changes or exit run view first" : placeholder}
          rows={1}
          enterKeyHint="send"
          className={cn(
            "min-w-0 flex-1 resize-none border-none bg-transparent text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground placeholder:line-clamp-1 sm:text-sm",
            disabled && "pointer-events-none",
            expanded
              ? "max-h-[min(128px,40dvh)] min-h-[24px] sm:max-h-[200px]"
              : "h-6 overflow-hidden"
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onFocus={() => {
            onFocus?.()
            setExpanded(true)
            if (window.matchMedia("(max-width: 639px)").matches) {
              requestAnimationFrame(() => {
                textareaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
              })
            }
          }}
          onBlur={onBlur}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            submit()
          }}
          disabled={submitLocked || !hasContent}
          className={cn(
            "ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-[0.92] touch-manipulation sm:h-9 sm:w-9",
            "disabled:cursor-not-allowed",
            submitLocked || !hasContent
              ? "bg-muted text-muted-foreground"
              : expanded
                ? "bg-teal-400 text-white hover:bg-teal-500"
                : "bg-navy-700 text-white hover:bg-navy-500"
          )}
          aria-label="Submit prompt"
        >
          {expanded ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="toolbar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="flex flex-wrap items-center gap-0.5 border-t border-border px-2 py-2 sm:px-3"
              onClick={(e) => e.stopPropagation()}
            >
              {enableFiles && (
                <ToolButton
                  icon={Upload}
                  active={fileCount > 0}
                  onClick={() => fileInputRef.current?.click()}
                  label="Upload file"
                />
              )}
              {enableUrls && (
                <ToolButton
                  icon={LinkIcon}
                  active={urlCount > 0 || urlOpen}
                  onClick={() => setUrlOpen((v) => !v)}
                  label="Add URL"
                />
              )}
              {enableImages && (
                <ToolButton
                  icon={ImageIcon}
                  onClick={() => fileInputRef.current?.click()}
                  label="Add image"
                />
              )}
              <span className="ml-auto mr-1 shrink-0 tabular-nums text-[11px] text-muted-foreground sm:mr-2">
                <span className="sm:hidden">{value.length}</span>
                <span className="hidden sm:inline">
                  {value.length} / {maxLength}
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToolButton({
  icon: Icon,
  active,
  onClick,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md transition-colors touch-manipulation sm:h-8 sm:w-8",
        active
          ? "bg-teal-50 text-teal-700"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
