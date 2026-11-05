import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface ContentMarkdownPreviewProps {
  markdown: string
  className?: string
}

export function ContentMarkdownPreview({ markdown, className = "" }: ContentMarkdownPreviewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  if (!markdown?.trim()) {
    return (
      <div className={`p-4 text-center text-xs text-muted-foreground border border-dashed rounded-lg ${className}`}>
        No content to preview yet.
      </div>
    )
  }

  return (
    <div className={`relative rounded-lg border bg-card p-4 shadow-sm ${className}`}>
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs flex items-center gap-1 bg-background"
          onClick={handleCopy}
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground pr-16">
        {markdown}
      </div>
    </div>
  )
}

