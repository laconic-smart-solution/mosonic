import { PromptArea, type Attachment } from "@/components/core/prompt-area"

type Props = {
  value: string
  onChange: (value: string) => void
  onAttachmentsChange: (attachments: Attachment[]) => void
  placeholder: string
  promptKey: number
}

export function RuleQaSourcesStep({
  value,
  onChange,
  onAttachmentsChange,
  placeholder,
  promptKey,
}: Props) {
  return (
    <PromptArea
      key={promptKey}
      value={value}
      onChange={onChange}
      onAttachmentsChange={onAttachmentsChange}
      placeholder={placeholder}
      acceptFileTypes=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
      submitDisabled
      className="border-border"
    />
  )
}
