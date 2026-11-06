import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowRight,
  ArrowUp,
  Upload,
  X,
  FileText,
  Globe,
  ImageIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { randomUuid } from "@/lib/random-uuid"
import { normalizeHttpUrl, urlDisplayLabel } from "@/lib/strategy-urls"

export function fileMatchesAccept(
  file: Pick<File, "name" | "type">,
  accept: string,
): boolean {
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.length === 0) return true
  const name = file.name.toLowerCase()
  const type = (file.type || "").toLowerCase()
  return tokens.some((token) => {
    if (token === "*/*") return true
    if (token.endsWith("/*")) return type.startsWith(`${token.slice(0, -1)}`)
    if (token.startsWith(".")) {
      return name.endsWith(token) || type.endsWith(token.slice(1))
    }
    return type === token
  })
}

/** Clipboard screenshots usually land in `items`; some browsers also fill `files`. */
export function filesFromClipboard(data: DataTransfer): File[] {
  const fromList = Array.from(data.files ?? [])
  if (fromList.length > 0) return fromList
  const out: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file) out.push(file)
  }
  return out
}

export function pastedFileLabel(file: Pick<File, "name" | "type">): string {
  if (file.name?.trim()) return file.name
  if (file.type.startsWith("image/")) {
    const ext = file.type.split("/")[1] || "png"
    return `pasted-image.${ext}`
  }
  return "pasted-file"
}

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
  acceptFileTypes = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp",
  className,
  disabled = false,
  submitDisabled,
}: PromptAreaProps) {
  const submitLocked = disabled || (submitDisabled ?? false)
  const [expanded, setExpanded] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState("")
  const [attachments, setAttachments] = React.useState<Attachment[]>([])

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
    if (!expanded) {
      el.style.height = ""
      return
    }
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

  function handleFiles(files: FileList | File[] | null) {
    if (!files || (files as FileList | File[]).length === 0) return
    const list = Array.from(files as ArrayLike<File>)
    const next: Attachment[] = list.map((f) => ({
      id: randomUuid(),
      type: "file",
      label: pastedFileLabel(f),
      data: f,
    }))
    setAttachments((prev) => [...prev, ...next])
    setExpanded(true)
  }

  /**
   * Paste priority:
   * 1. Image/file from the clipboard (Ctrl+V screenshot) → file chip when files are enabled
   * 2. A paste that is nothing but one or more links → URL chips
   * Mixed prose + URL is left alone so we don't strip words around a link.
   */
  function handleTextareaPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (enableFiles && !disabled) {
      const pastedFiles = filesFromClipboard(e.clipboardData).filter((file) =>
        fileMatchesAccept(file, acceptFileTypes),
      )
      if (pastedFiles.length > 0) {
        e.preventDefault()
        handleFiles(pastedFiles)
        return
      }
    }

    const pasted = e.clipboardData.getData("text")
    const parts = pasted
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return

    const normalized = parts.map((part) => normalizeHttpUrl(part))
    if (normalized.some((url) => !url)) return

    e.preventDefault()
    const next: Attachment[] = normalized.map((url) => ({
      id: randomUuid(),
      type: "url",
      label: urlDisplayLabel(url!),
      data: url!,
    }))
    setAttachments((prev) => [...prev, ...next])
    setExpanded(true)
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const fileCount = attachments.filter((a) => a.type === "file").length

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
        const target = e.target
        if (
          target instanceof Element &&
          target.closest(
            "input, textarea, button, a, label, [role='button'], [contenteditable='true']",
          )
        ) {
          return
        }
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
                    att.data instanceof File && att.data.type.startsWith("image/") ? (
                      <AttachmentImageThumb file={att.data} />
                    ) : (
                      <FileText className="h-3 w-3 shrink-0" />
                    )
                  ) : (
                    <Globe className="h-3 w-3 shrink-0" />
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
          onPaste={handleTextareaPaste}
          disabled={disabled}
          placeholder={disabled ? "Save workflow changes or exit run view first" : placeholder}
          rows={1}
          enterKeyHint="send"
          className={cn(
            "min-w-0 flex-1 resize-none overflow-y-auto border-none bg-transparent text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground placeholder:line-clamp-1 sm:text-sm",
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

function AttachmentImageThumb({ file }: { file: File }) {
  const [src, setSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!src) {
    return <ImageIcon className="h-3 w-3 shrink-0" aria-hidden />
  }

  return (
    <img
      src={src}
      alt=""
      className="size-4 shrink-0 rounded-[3px] object-cover"
    />
  )
}
