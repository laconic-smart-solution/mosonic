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
  disabled?: boolean
  submitDisabled?: boolean
}

export function HomePromptBar({
  prompt,
  placeholder,
  onPromptChange,
  onFocus,
  onBlur,
  onSubmit,
  disabled = false,
  submitDisabled = false,
}: HomePromptBarProps) {
  return (
    <div className="w-full max-w-[600px] px-0">
      <PromptArea
        value={prompt}
        onChange={onPromptChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        onSubmit={onSubmit}
        disabled={disabled}
        submitDisabled={submitDisabled}
        className="shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      />
    </div>
  )
}
