import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChatActiveWorkflowCard } from "./chat-active-workflow-card"
import { ChatContentList } from "./chat-content-list"
import { ChatPostList } from "./chat-post-list"

function WorkspaceSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="px-0.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** One brand profile = one chat thread — workflow plus Contents | Posts lists. */
export function ChatWorkspacePanel({ ruleId }: { ruleId: string | null }) {
  const { t } = useTranslation("chat")

  return (
    <aside className="flex h-full w-72 min-w-0 shrink-0 flex-col overflow-hidden border-r border-canvas-200 dark:border-white/8 bg-canvas-100 dark:bg-navy-800">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-3 py-4">
          {ruleId ? (
            <>
              <WorkspaceSection title={t("workspace.activeWorkflow")}>
                <ChatActiveWorkflowCard ruleId={ruleId} />
              </WorkspaceSection>
              <Tabs defaultValue="contents" className="gap-3">
                <TabsList
                  variant="line"
                  className="h-auto w-full justify-start gap-0 rounded-none border-b border-canvas-200 p-0 dark:border-white/8"
                >
                  <TabsTrigger
                    value="contents"
                    className="flex-none rounded-none px-3 pb-2 text-xs data-active:shadow-none"
                  >
                    {t("workspace.tabs.contents")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="posts"
                    className="flex-none rounded-none px-3 pb-2 text-xs data-active:shadow-none"
                  >
                    {t("workspace.tabs.posts")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="contents" className="mt-0 outline-none">
                  <ChatContentList ruleId={ruleId} />
                </TabsContent>
                <TabsContent value="posts" className="mt-0 outline-none">
                  <ChatPostList ruleId={ruleId} />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <p className="px-1 text-xs text-muted-foreground">{t("workspace.noRule")}</p>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
