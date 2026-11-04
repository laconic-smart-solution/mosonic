import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"
import { BrainCircuit, Eraser } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { ChatBrandPanel } from "@/features/chat/components/chat-brand-panel"
import { ChatComposer } from "@/features/chat/components/chat-composer"
import { ChatContextUsage } from "@/features/chat/components/chat-context-usage"
import { ChatMessageThread } from "@/features/chat/components/chat-message-thread"
import { ChatRuleBuildProgress } from "@/features/chat/components/chat-rule-build-progress"
import { ChatRuleSelector } from "@/features/chat/components/chat-rule-selector"
import { ChatWorkspacePanel } from "@/features/chat/components/chat-workspace-panel"
import { ChatClearConversationDialog } from "@/features/chat/components/dialogs/chat-clear-conversation-dialog"
import { ChatMemoryDialog } from "@/features/chat/components/dialogs/chat-memory-dialog"
import { ChatUploadAssetsDialog } from "@/features/chat/components/dialogs/chat-upload-assets-dialog"
import { ChatActionsContext, type ChatActions } from "@/features/chat/hooks/use-chat-actions"
import { useActiveChatSession } from "@/features/chat/hooks/use-active-chat-session"
import { useChatSteps } from "@/features/chat/hooks/use-chat-steps"
import { useRuleBuildProgress } from "@/features/chat/hooks/use-rule-build-progress"
import { useQueryClient } from "@tanstack/react-query"
import { flattenChatMessagePages } from "@/features/chat/lib/chat-message-pages"
import {
  readHomeOauthReturn,
  stripHomeOauthParams,
} from "@/features/home/lib/home-oauth-return"
import { RedNoteQrConnectDialog } from "@/features/settings/components/rednote-qr-connect-dialog"
import { useChatMessagesQuery, useSendChatMessageMutation } from "@/shared/queries/chat.query"
import { useSyncZernioAccountsMutation } from "@/shared/queries/zernio.query"
import type { ContextUsage } from "@/shared/services/chat.service"

export default function HomePage() {
  const navigate = useNavigate()
  const { t } = useTranslation("chat")
  const { t: tSettings } = useTranslation("settings")
  const [searchParams, setSearchParams] = useSearchParams()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [rednoteQrOpen, setRednoteQrOpen] = useState(false)
  const [rednoteSocketRoom, setRednoteSocketRoom] = useState<string | null>(null)
  const brandPanelRef = useRef<HTMLDivElement>(null)
  const handledOAuthRef = useRef(false)
  const syncMutation = useSyncZernioAccountsMutation()

  const {
    ruleOptions,
    selectedRuleId,
    selectRule,
    bindRuleToCurrentSession,
    isLoadingRules,
    isLoadingMoreRules,
    canViewMoreRules,
    onViewMoreRules,
    activeSessionId,
    createSession,
  } = useActiveChatSession()

  const selectedRule = ruleOptions.find((r) => r.ruleId === selectedRuleId)

  useEffect(() => {
    setContextUsage(null)
  }, [activeSessionId])

  useEffect(() => {
    if (handledOAuthRef.current) return
    const { connected, error } = readHomeOauthReturn(searchParams)
    if (!connected && !error) return
    handledOAuthRef.current = true
    if (connected) {
      toast.success(tSettings("oauth.connectedToast", { platform: connected }))
      syncMutation.mutate(undefined, {
        onSuccess: () => {
          toast.success(tSettings("oauth.syncedToast"))
          setSearchParams((prev) => stripHomeOauthParams(prev), { replace: true })
        },
        onError: () => {
          toast.error(tSettings("oauth.syncFailed"))
          setSearchParams((prev) => stripHomeOauthParams(prev), { replace: true })
        },
      })
      return
    }
    toast.error(tSettings("oauth.callbackFailed"))
    setSearchParams((prev) => stripHomeOauthParams(prev), { replace: true })
  }, [searchParams, setSearchParams, syncMutation, tSettings])

  const messagesQuery = useChatMessagesQuery(activeSessionId ?? undefined)
  const { messages: threadMessages, historicalIds } = useMemo(
    () => flattenChatMessagePages(messagesQuery.data?.pages),
    [messagesQuery.data],
  )
  const sendMessageMutation = useSendChatMessageMutation()
  const queryClient = useQueryClient()
  // Run follow-up replies arrive over the socket, not from our own send - refetch the thread.
  const { liveSteps, isFollowUp, prepareSession } = useChatSteps(activeSessionId, (sessionId) => {
    void queryClient.invalidateQueries({ queryKey: ["chat-messages", sessionId] })
  })
  const { step: ruleBuildStep, startTracking: startTrackingRuleBuild } = useRuleBuildProgress()

  // A running generation never locks the composer; only a reply being written does
  // (our own send, or the short automatic report when a run finishes).
  const isBusy = sendMessageMutation.isPending || isFollowUp

  async function handleSend(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isBusy) return

    const sessionId = activeSessionId ?? (await createSession())
    if (!sessionId) return

    prepareSession(sessionId)
    setDraft("")
    let result
    try {
      result = await sendMessageMutation.mutateAsync({ sessionId, content: trimmed })
    } catch {
      // Errors (incl. the 409 "still working" toast) are surfaced by the mutation; keep the draft.
      setDraft((current) => current || trimmed)
      return
    }
    setContextUsage(result.contextUsage)
    if (result.session.ruleId && result.session.ruleId !== selectedRuleId) {
      bindRuleToCurrentSession(result.session.ruleId)
      startTrackingRuleBuild(result.session.ruleId)
    }
  }

  const chatActions = useMemo<ChatActions>(
    () => ({ sendMessage: (text) => void handleSend(text), busy: isBusy }),
    // handleSend closes over the latest session/rule; re-create when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBusy, activeSessionId, selectedRuleId],
  )

  function openUpload() {
    if (selectedRuleId) setUploadOpen(true)
    else brandPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  return (
    <ChatActionsContext.Provider value={chatActions}>
    <div className="flex h-full min-h-0 min-w-0 w-full overflow-hidden bg-canvas-100 dark:bg-navy-900">
      <ChatWorkspacePanel ruleId={selectedRuleId} />

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#FBF9F6] dark:bg-navy-900">
        <div className="flex items-center border-b border-canvas-200 dark:border-white/8 px-4 py-2.5">
          <ChatRuleSelector
            rules={ruleOptions}
            selectedRuleLabel={selectedRule?.name}
            isLoadingRules={isLoadingRules}
            isLoadingMore={isLoadingMoreRules}
            canViewMore={canViewMoreRules}
            onSelectRule={selectRule}
            onViewMore={onViewMoreRules}
            onNewBrand={() => {
              // Unbound chat = onboarding; the AI creates the new brand profile (create_rule_from_intake).
              setDraft("")
              selectRule(null)
            }}
          />
          <div className="ml-auto flex items-center gap-0.5">
            {selectedRuleId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-[9px] text-canvas-600 dark:text-navy-200"
                aria-label={t("dialogs.memory.action")}
                title={t("dialogs.memory.action")}
                onClick={() => setMemoryOpen(true)}
              >
                <BrainCircuit />
              </Button>
            ) : null}
            {activeSessionId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-[9px] text-canvas-600 dark:text-navy-200"
                aria-label={t("dialogs.clearConversation.action")}
                title={t("dialogs.clearConversation.action")}
                onClick={() => setClearOpen(true)}
              >
                <Eraser />
              </Button>
            ) : null}
          </div>
        </div>

        <ChatMessageThread
          messages={threadMessages}
          historicalIds={historicalIds}
          isLoading={messagesQuery.isLoading}
          hasOlder={messagesQuery.hasNextPage}
          isLoadingOlder={messagesQuery.isFetchingNextPage}
          onLoadOlder={() => void messagesQuery.fetchNextPage()}
          brandName={selectedRule?.name}
          isSending={isBusy}
          liveSteps={liveSteps}
          onRequestUpload={openUpload}
          onStartRednoteQr={(socketRoom) => {
            setRednoteSocketRoom(socketRoom)
            setRednoteQrOpen(true)
          }}
          onChoose={(text) => void handleSend(text)}
        />
        <ChatRuleBuildProgress step={ruleBuildStep} />
        <ChatContextUsage usage={contextUsage} />
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={handleSend}
          busy={isBusy}
          ruleId={selectedRuleId}
        />
      </div>

      <ChatBrandPanel
        ref={brandPanelRef}
        ruleId={selectedRuleId}
        onNavigateSetup={() => navigate("/rules")}
        onAddAssets={openUpload}
      />
      <ChatClearConversationDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        brandName={selectedRule?.name ?? t("brandPanel.panelTitle")}
        // TODO: wire onConfirm once the server exposes a clear-messages endpoint for a session.
      />
      <ChatMemoryDialog
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        ruleId={selectedRuleId}
        brandName={selectedRule?.name ?? t("brandPanel.panelTitle")}
      />
      {selectedRuleId ? (
        <ChatUploadAssetsDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          ruleId={selectedRuleId}
          onUploaded={(files) => {
            if (activeSessionId) void handleSend(t("composer.uploadedFilesNote", { files: files.join(", ") }))
          }}
        />
      ) : null}
      <RedNoteQrConnectDialog
        open={rednoteQrOpen}
        onOpenChange={setRednoteQrOpen}
        socketRoom={rednoteSocketRoom}
        onSuccess={() => {
          setRednoteQrOpen(false)
          toast.success(tSettings("oauth.connectedToast", { platform: "rednote" }))
          void handleSend(t("composer.rednoteConnectedNote"))
        }}
        onFailed={(reason) => {
          toast.error(reason || tSettings("oauth.callbackFailed"))
        }}
      />
    </div>
    </ChatActionsContext.Provider>
  )
}
