import { useState } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = {
  keywords: string[]
  disabled?: boolean
  max?: number
  onChange: (keywords: string[]) => void
}

export function KeywordTagInput({
  keywords,
  disabled,
  max = 10,
  onChange,
}: Props) {
  const [input, setInput] = useState("")

  const add = () => {
    const kw = input.trim().toLowerCase()
    if (!kw || keywords.includes(kw) || keywords.length >= max) return
    onChange([...keywords, kw])
    setInput("")
  }

  return (
    <div className="space-y-2.5">
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {kw}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(keywords.filter((k) => k !== kw))}
                  className="text-primary/60 hover:text-primary"
                  aria-label={`Remove ${kw}`}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && keywords.length < max && (
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add()
              }
            }}
            placeholder="Type a keyword and press Enter"
            className="h-9 flex-1 bg-background text-sm"
          />
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            Add
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {keywords.length}/{max} keywords used
      </p>
    </div>
  )
}
