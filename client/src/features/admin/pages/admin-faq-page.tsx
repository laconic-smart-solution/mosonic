import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Upload } from "lucide-react"

import { PageShell } from "@/components/app/page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { AdminFaqBarItem } from "../components/admin-faq-bar-item"
import { AdminFaqUploadDialog } from "../components/admin-faq-upload-dialog"
import {
  useAdminFaqDocuments,
  useAdminFaqs,
} from "../hooks/use-admin-faq"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"
const TAB_IDS = ["documents", "faqs"] as const
type TabId = (typeof TAB_IDS)[number]

function parseTab(value: string | null): TabId {
  if (value && (TAB_IDS as readonly string[]).includes(value)) {
    return value as TabId
  }
  return "documents"
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export default function AdminFaqPage() {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseTab(searchParams.get("tab"))
  const [uploadOpen, setUploadOpen] = useState(false)

  const [docPage, setDocPage] = useState(1)
  const [faqPage, setFaqPage] = useState(1)
  const [faqQuery, setFaqQuery] = useState("")
  const [faqSearch, setFaqSearch] = useState("")

  const { data: documents, isLoading: docsLoading } = useAdminFaqDocuments({
    page: docPage,
    limit: 20,
  })
  const { data: faqs, isLoading: faqsLoading } = useAdminFaqs({
    page: faqPage,
    limit: 20,
    q: faqSearch || undefined,
  })

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("faq.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("faq.subtitle")}</p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setSearchParams({ tab: value })}
        >
          <TabsList variant="default" aria-label={t("faq.tabsLabel")}>
            {TAB_IDS.map((tabId) => (
              <TabsTrigger key={tabId} value={tabId}>
                {t(`faq.tabs.${tabId}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {activeTab === "documents" ? (
          <div className={cn(panelClass, "p-4 space-y-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("faq.documentsHint")}</p>
              <Button type="button" onClick={() => setUploadOpen(true)}>
                <Upload className="size-4" aria-hidden />
                {t("faq.upload")}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("faq.columns.filename")}</TableHead>
                  <TableHead>{t("faq.columns.status")}</TableHead>
                  <TableHead>{t("faq.columns.faqCount")}</TableHead>
                  <TableHead>{t("faq.columns.size")}</TableHead>
                  <TableHead>{t("faq.columns.uploadedBy")}</TableHead>
                  <TableHead>{t("faq.columns.createdAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      {tc("actions.loading")}
                    </TableCell>
                  </TableRow>
                ) : documents?.items.length ? (
                  documents.items.map((doc) => (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/faq/documents/${doc.id}`)}
                    >
                      <TableCell className="font-medium">{doc.filename}</TableCell>
                      <TableCell>{doc.status}</TableCell>
                      <TableCell>{doc.faq_count}</TableCell>
                      <TableCell>{formatBytes(doc.file_size)}</TableCell>
                      <TableCell>{doc.uploaded_by}</TableCell>
                      <TableCell>{formatDate(doc.created_at)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      {t("faq.emptyDocuments")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {documents && documents.total > documents.limit ? (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={docPage <= 1}
                  onClick={() => setDocPage((p) => p - 1)}
                >
                  {tc("pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={docPage * documents.limit >= documents.total}
                  onClick={() => setDocPage((p) => p + 1)}
                >
                  {tc("pagination.next")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={cn(panelClass, "space-y-4 p-4")}>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setFaqSearch(faqQuery.trim())
                setFaqPage(1)
              }}
            >
              <Input
                value={faqQuery}
                onChange={(e) => setFaqQuery(e.target.value)}
                placeholder={t("faq.searchFaqs")}
                className="max-w-sm"
                aria-label={t("faq.searchFaqs")}
              />
              <Button type="submit" variant="secondary">
                {tc("actions.search")}
              </Button>
            </form>

            {faqsLoading ? (
              <p className="text-sm text-muted-foreground">{tc("actions.loading")}</p>
            ) : faqs?.items.length ? (
              <ul className="flex flex-col gap-2">
                {faqs.items.map((faq) => (
                  <li key={faq.id}>
                    <AdminFaqBarItem
                      faq={faq}
                      footer={
                        faq.source_document_id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() =>
                              navigate(`/admin/faq/documents/${faq.source_document_id}`)
                            }
                          >
                            {t("faq.viewDocument")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("faq.emptyFaqs")}</p>
            )}

            {faqs && faqs.total > faqs.limit ? (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={faqPage <= 1}
                  onClick={() => setFaqPage((p) => p - 1)}
                >
                  {tc("pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={faqPage * faqs.limit >= faqs.total}
                  onClick={() => setFaqPage((p) => p + 1)}
                >
                  {tc("pagination.next")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <AdminFaqUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </PageShell>
  )
}
