import {
  PromptArea,
  type Attachment,
} from "@/components/core/prompt-area"

type HomePromptBarProps = {
  prompt: string
  placeholder: string
  onPromptChange: (v: string) => void
  onFocus: () => void
  onBlur: () => void
  onSubmit: (text: string, attachments: Attachment[]) => void
}

export function HomePromptBar({
  prompt,
  placeholder,
  onPromptChange,
  onFocus,
  onBlur,
  onSubmit,
}: HomePromptBarProps) {
  return (
    <div className="w-full max-w-[600px]">
      <PromptArea
        value={prompt}
        onChange={onPromptChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        onSubmit={onSubmit}
        className="shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      />
    </div>
  )
}
