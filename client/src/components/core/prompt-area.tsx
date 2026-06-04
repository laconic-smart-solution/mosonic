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
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value, expanded])

  React.useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setUrlOpen(false)
        if (!hasContent) setExpanded(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
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
          : "rounded-full border-border hover:border-muted-foreground/40",
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
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
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
                  <span className="max-w-[200px] truncate">{att.label}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeAttachment(att.id)
                    }}
                    className="opacity-50 transition-opacity hover:opacity-100"
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
              className="flex items-center gap-1.5 px-4 pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
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
                className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-teal-400"
              />
              <button
                type="button"
                onClick={addUrl}
                className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy-500"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setUrlOpen(false)
                  setUrlValue("")
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "flex w-full items-center",
          expanded ? "px-4 pb-2 pt-3" : "h-[52px] pl-5 pr-1.5"
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
          className={cn(
            "min-w-0 flex-1 resize-none border-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground placeholder:line-clamp-1",
            disabled && "pointer-events-none",
            expanded
              ? "max-h-[200px] min-h-[24px]"
              : "h-6 overflow-hidden"
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onFocus={() => {
            onFocus?.()
            setExpanded(true)
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
            "ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-[0.92]",
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
              className="flex items-center gap-0.5 border-t border-border px-3 py-2"
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
              <div className="flex-1" />
              <span className="mr-2 tabular-nums text-[11px] text-muted-foreground">
                {value.length} / {maxLength}
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
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-teal-50 text-teal-700"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
