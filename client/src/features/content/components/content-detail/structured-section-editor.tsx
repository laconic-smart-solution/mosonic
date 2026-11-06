import { useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  Hash,
  Heading,
  List,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { contentService } from "@/shared/services/content.service"
import type { ContentSectionItem, ContentSectionKind } from "@/shared/types/content.type"
import { ContentMarkdownPreview } from "./content-markdown-preview"

export interface StructuredSectionEditorProps {
  contentId: string
  sections: ContentSectionItem[]
  compiledText?: string
  disabled?: boolean
  onChange: (updatedSections: ContentSectionItem[], compiledMarkdown?: string) => void
}

function getSectionIcon(kind: ContentSectionKind) {
  switch (kind) {
    case "heading":
      return <Heading className="size-3.5" />
    case "bullet_list":
    case "numbered_list":
      return <List className="size-3.5" />
    case "call_to_action":
      return <Megaphone className="size-3.5" />
    case "hashtags":
      return <Hash className="size-3.5" />
    default:
      return <Type className="size-3.5" />
  }
}

function getKindBadgeLabel(kind: ContentSectionKind): string {
  switch (kind) {
    case "heading":
      return "Heading"
    case "paragraph":
      return "Paragraph"
    case "bullet_list":
      return "Bullet List"
    case "numbered_list":
      return "Numbered List"
    case "call_to_action":
      return "Call to Action"
    case "hashtags":
      return "Hashtags"
    default:
      return kind.replace(/_/g, " ")
  }
}

export function StructuredSectionEditor({
  contentId,
  sections,
  compiledText = "",
  disabled = false,
  onChange,
}: StructuredSectionEditorProps) {
  const [activeTab, setActiveTab] = useState<"sections" | "preview" | "raw">("sections")
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null)
  const [regenInstruction, setRegenInstruction] = useState<Record<string, string>>({})
  const [showRegenPrompt, setShowRegenPrompt] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const handleUpdateSection = async (
    key: string,
    updates: Partial<ContentSectionItem>
  ) => {
    const next = sections.map((s) => (s.key === key ? { ...s, ...updates } : s))
    onChange(next)

    // Persist to server
    try {
      setSavingKey(key)
      const res = await contentService.updateSection(contentId, key, {
        title: updates.title,
        content: updates.content,
        items: updates.items,
      })
      if (res.compiledText) {
        onChange(next, res.compiledText)
      }
    } catch {
      // ignore
    } finally {
      setSavingKey(null)
    }
  }

  const handleRegenerate = async (key: string) => {
    setRegeneratingKey(key)
    try {
      const instruction = regenInstruction[key]?.trim() || undefined
      const res = await contentService.regenerateSection(contentId, key, {
        userInstruction: instruction,
      })
      if (res.section) {
        const next = sections.map((s) => (s.key === key ? res.section : s))
        onChange(next, res.compiledText)
        setShowRegenPrompt((prev) => ({ ...prev, [key]: false }))
      }
    } catch {
      // ignore
    } finally {
      setRegeneratingKey(null)
    }
  }

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= sections.length) return
    const next = [...sections]
    const temp = next[index]
    next[index] = next[targetIdx]
    next[targetIdx] = temp
    onChange(next)
  }

  const handleRemove = (key: string) => {
    const next = sections.filter((s) => s.key !== key)
    onChange(next)
  }

  const handleAddSection = () => {
    const newKey = `custom_${Date.now()}`
    const newSection: ContentSectionItem = {
      key: newKey,
      title: "New Section",
      kind: "paragraph",
      content: "",
    }
    onChange([...sections, newSection])
  }

  return (
    <div className="space-y-3">
      {/* View Switcher Tabs */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex gap-1">
          <Button
            type="button"
            variant={activeTab === "sections" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("sections")}
          >
            Structured Sections ({sections.length})
          </Button>
          <Button
            type="button"
            variant={activeTab === "preview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("preview")}
          >
            Markdown Preview
          </Button>
          <Button
            type="button"
            variant={activeTab === "raw" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("raw")}
          >
            Raw Markdown
          </Button>
        </div>

        {activeTab === "sections" && !disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs flex items-center gap-1"
            onClick={handleAddSection}
          >
            <Plus className="size-3.5" />
            Add Section
          </Button>
        )}
      </div>

      {/* Tab 1: Structured Section Cards */}
      {activeTab === "sections" && (
        <div className="space-y-3">
          {sections.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              No structured sections detected. Click &quot;Add Section&quot; to create one.
            </div>
          ) : (
            sections.map((section, idx) => {
              const isRegenerating = regeneratingKey === section.key
              const isSaving = savingKey === section.key
              const isFirst = idx === 0
              const isLast = idx === sections.length - 1

              return (
                <div
                  key={section.key}
                  className="rounded-lg border bg-card/60 p-3 shadow-xs space-y-2.5 transition-all hover:border-primary/30"
                >
                  {/* Section Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge
                        variant="secondary"
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      >
                        {getSectionIcon(section.kind)}
                        <span>{getKindBadgeLabel(section.kind)}</span>
                      </Badge>
                      <Input
                        value={section.title || ""}
                        disabled={disabled}
                        placeholder="Section title"
                        onChange={(e) =>
                          handleUpdateSection(section.key, { title: e.target.value })
                        }
                        className="h-7 text-xs font-semibold border-transparent hover:border-border focus:border-primary px-1.5 py-0 bg-transparent flex-1"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      {isSaving && (
                        <span className="text-[10px] text-muted-foreground mr-1">Saving…</span>
                      )}
                      {!disabled && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isFirst}
                            className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleMove(idx, "up")}
                            title="Move up"
                          >
                            <ChevronUp className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isLast}
                            className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleMove(idx, "down")}
                            title="Move down"
                          >
                            <ChevronDown className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isRegenerating}
                            className="h-6 text-[11px] px-2 flex items-center gap-1"
                            onClick={() =>
                              setShowRegenPrompt((prev) => ({
                                ...prev,
                                [section.key]: !prev[section.key],
                              }))
                            }
                          >
                            <Sparkles className="size-3 text-primary" />
                            Regen
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemove(section.key)}
                            title="Remove section"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline Regeneration Prompt Box */}
                  {showRegenPrompt[section.key] && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                        <Sparkles className="size-3.5" />
                        <span>Regenerate this section</span>
                      </div>
                      <Input
                        placeholder="Optional instruction (e.g. 'Make it punchier', 'Include discount code')..."
                        value={regenInstruction[section.key] || ""}
                        onChange={(e) =>
                          setRegenInstruction((prev) => ({
                            ...prev,
                            [section.key]: e.target.value,
                          }))
                        }
                        className="h-7 text-xs bg-background"
                      />
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() =>
                            setShowRegenPrompt((prev) => ({
                              ...prev,
                              [section.key]: false,
                            }))
                          }
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={isRegenerating}
                          className="h-6 text-xs flex items-center gap-1"
                          onClick={() => handleRegenerate(section.key)}
                        >
                          {isRegenerating ? (
                            <RefreshCw className="size-3 animate-spin" />
                          ) : (
                            <Sparkles className="size-3" />
                          )}
                          <span>Generate</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Section Content Area */}
                  {section.kind === "bullet_list" || section.kind === "numbered_list" ? (
                    <div className="space-y-1.5 pl-1">
                      {Array.isArray(section.items) && section.items.length > 0 ? (
                        section.items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex items-center gap-1.5">
                            <span className="text-muted-foreground text-xs select-none">
                              {section.kind === "bullet_list" ? "•" : `${itemIdx + 1}.`}
                            </span>
                            <Input
                              value={item}
                              disabled={disabled}
                              onChange={(e) => {
                                const newItems = [...(section.items || [])]
                                newItems[itemIdx] = e.target.value
                                handleUpdateSection(section.key, { items: newItems })
                              }}
                              className="h-7 text-xs flex-1 bg-transparent border-border/40 focus:border-primary"
                            />
                            {!disabled && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  const newItems = section.items!.filter((_, i) => i !== itemIdx)
                                  handleUpdateSection(section.key, { items: newItems })
                                }}
                              >
                                <Trash2 className="size-2.5" />
                              </Button>
                            )}
                          </div>
                        ))
                      ) : (
                        <Textarea
                          value={section.content || ""}
                          disabled={disabled}
                          placeholder="Enter items, one per line..."
                          onChange={(e) =>
                            handleUpdateSection(section.key, { content: e.target.value })
                          }
                          className="text-xs min-h-[60px] bg-transparent resize-y"
                        />
                      )}
                      {!disabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2"
                          onClick={() => {
                            const newItems = [...(section.items || []), ""]
                            handleUpdateSection(section.key, { items: newItems })
                          }}
                        >
                          <Plus className="size-3 mr-1" />
                          Add Item
                        </Button>
                      )}
                    </div>
                  ) : section.kind === "hashtags" ? (
                    <Textarea
                      value={section.content || (section.items ? section.items.join(" ") : "")}
                      disabled={disabled}
                      placeholder="#hashtag1 #hashtag2 #hashtag3"
                      onChange={(e) => {
                        const val = e.target.value
                        const tags = val.match(/#\w+/g) || []
                        handleUpdateSection(section.key, { content: val, items: tags })
                      }}
                      className="text-xs min-h-[50px] bg-transparent resize-y font-mono"
                    />
                  ) : (
                    <Textarea
                      value={section.content || ""}
                      disabled={disabled}
                      placeholder="Enter section copy..."
                      onChange={(e) =>
                        handleUpdateSection(section.key, { content: e.target.value })
                      }
                      className="text-xs min-h-[70px] bg-transparent resize-y leading-relaxed"
                    />
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Tab 2: Markdown Preview */}
      {activeTab === "preview" && (
        <ContentMarkdownPreview markdown={compiledText} />
      )}

      {/* Tab 3: Raw Markdown Textarea (Backward Compatible Plain-Text Fallback) */}
      {activeTab === "raw" && (
        <div className="space-y-2">
          <Textarea
            value={compiledText}
            disabled={disabled}
            onChange={(e) => onChange(sections, e.target.value)}
            className="min-h-[220px] font-mono text-xs leading-relaxed"
          />
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Pencil className="size-3 shrink-0" />
            Direct raw Markdown edits will be preserved and published.
          </p>
        </div>
      )}
    </div>
  )
}

