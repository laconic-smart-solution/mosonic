import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function RuleQaTagInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("")

  function addTag() {
    const tag = draft.trim()
    if (!tag || value.includes(tag)) return
    onChange([...value, tag])
    setDraft("")
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addTag()
            }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={addTag}>
          <Plus className="size-4" />
        </Button>
      </div>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs"
            >
              {tag}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
