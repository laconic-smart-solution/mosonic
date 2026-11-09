import { dedupeAskQuestion, displayUserChoice } from "../lib/parse-ask-user"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/shared/services/chat.service"
import { findAskUserPrompt } from "../lib/parse-ask-user"
import { findContentCards } from "../lib/parse-content-card"
import { splitAttachments } from "../lib/chat-attachments"
import { findRunBriefs } from "../lib/parse-run-brief"
import { ChatRunBrief } from "./chat-run-brief"
import { ChatAttachmentThumbs } from "./chat-attachment-thumbs"
import { findPipelineCards } from "../lib/parse-pipeline-card"
import { findStartedRunIds } from "../lib/chat-run-progress"
import { ChatRunCard } from "./chat-run-card"
import { findStartOauth, findStartRednoteQr } from "../lib/parse-start-oauth"
import { findCanvasLink, findToolError } from "../lib/parse-tool-error"
import { findWorkflowCards } from "../lib/parse-workflow-card"
import { ChatAskUser } from "./chat-ask-user"
import { ChatAssistantAvatar } from "./chat-assistant-avatar"
import { ChatConnectActions } from "./chat-connect-actions"
import { ChatContentCard } from "./chat-content-card"
import { ChatPipelineCard } from "./chat-pipeline-card"
import { ChatStepAccordion, OpenCanvasButton } from "./chat-step-accordion"
import { ChatToolErrorNotice } from "./chat-tool-error-notice"
import { ChatMessageTokenMeta } from "./chat-message-token-meta"
import { ChatWorkflowCard } from "./chat-workflow-card"

export function ChatMessageBubble({
  message,
  onRequestUpload,
  onStartRednoteQr,
  onChoose,
  askUserDisabled,
  isLatest,
  historical,
}: {
  message: ChatMessage
  onRequestUpload?: () => void
  onStartRednoteQr?: (socketRoom: string) => void
  onChoose?: (text: string) => void
  askUserDisabled?: boolean
  /** Latest assistant turn with no user reply yet — only it offers tool-error recovery. */
  isLatest?: boolean
  /** Loaded from an older history page: run cards render collapsed, without live updates. */
  historical?: boolean
}) {
  const isUser = message.role === "user"
  const { text: rawShownText, attachments } = isUser
    ? splitAttachments(message.content)
    : { text: message.content, attachments: [] }
  const shownText = isUser ? displayUserChoice(rawShownText) : dedupeAskQuestion(rawShownText, findAskUserPrompt(message.steps)?.question)
  // ask_user-only turns: the chips are enough, no step box.
  const onlyAskUser = (message.steps ?? []).every((s) => !("name" in s) || s.name === "ask_user")
  const askUser = !isUser ? findAskUserPrompt(message.steps) : null
  const workflowCards = !isUser ? findWorkflowCards(message.steps) : []
  // Runs this reply started get the live run card; status lookups keep the plain pipeline card.
  const runIds = !isUser ? findStartedRunIds(message.steps) : []
  const pipelineCards = !isUser
    ? findPipelineCards(message.steps).filter((card) => !runIds.includes(card.pipelineId))
    : []
  const contentCards = !isUser ? findContentCards(message.steps) : []
  const oauthConnects = !isUser ? findStartOauth(message.steps) : []
  const rednoteConnect = !isUser ? findStartRednoteQr(message.steps) : null
  const runBriefs = !isUser ? findRunBriefs(message.steps) : []
  const toolError = !isUser && isLatest ? findToolError(message.steps) : null
  const canvasPath = !isUser ? findCanvasLink(message.steps) : null

  return (
    <div className={cn("flex w-full min-w-0 gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? <ChatAssistantAvatar /> : null}
      <div className={cn("flex min-w-0 w-full max-w-[75%] flex-col gap-2 overflow-hidden", isUser && "items-end")}>
        {!isUser && message.steps && message.steps.length > 0 && !onlyAskUser ? (
          <ChatStepAccordion
            steps={message.steps}
            onRequestUpload={onRequestUpload}
            onStartRednoteQr={onStartRednoteQr}
          />
        ) : null}
        {attachments.length > 0 ? <ChatAttachmentThumbs attachments={attachments} /> : null}
        {shownText ? (
          <div
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              isUser
                ? "rounded-2xl rounded-br-md bg-navy-700 px-4 py-2.5 text-sm text-white dark:bg-teal-400 dark:text-navy-700"
                : "rounded-2xl rounded-tl-md border border-canvas-200/90 bg-white px-4 py-3 text-[14.5px] font-normal text-navy-900 shadow-xs dark:border-white/10 dark:bg-[#121A2B] dark:text-[#F3F1EC]",
            )}
          >
            {shownText}
          </div>
        ) : null}
        {!isUser ? (
          <ChatConnectActions
            oauth={oauthConnects}
            rednote={rednoteConnect}
            onStartRednoteQr={onStartRednoteQr}
          />
        ) : null}
        {workflowCards.map((card) => (
          <ChatWorkflowCard key={card.workflowId} snapshot={card} />
        ))}
        {runBriefs.map((brief) => (
          <ChatRunBrief key={`brief-${brief.pipelineId}`} brief={brief} />
        ))}
        {runIds.map((pipelineId) => (
          <ChatRunCard
            key={pipelineId}
            sessionId={message.sessionId}
            pipelineId={pipelineId}
            historical={historical}
          />
        ))}
        {pipelineCards.map((card) => (
          <ChatPipelineCard key={card.pipelineId} snapshot={card} />
        ))}
        {contentCards.map((card) => (
          <ChatContentCard key={card.contentId} snapshot={card} />
        ))}
        {canvasPath ? (
          <div>
            <OpenCanvasButton path={canvasPath} />
          </div>
        ) : null}
        {toolError ? <ChatToolErrorNotice error={toolError} /> : null}
        {askUser && onChoose ? (
          <ChatAskUser
            prompt={askUser}
            disabled={askUserDisabled}
            onChoose={onChoose}
          />
        ) : null}
        {isUser || !(message.steps && message.steps.length > 0 && !onlyAskUser) ? (
          <ChatMessageTokenMeta message={message} align={isUser ? "end" : "start"} />
        ) : null}
      </div>
    </div>
  )
}
