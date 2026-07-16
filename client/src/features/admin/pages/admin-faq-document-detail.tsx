import { Download } from "lucide-react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { PageShell } from "@/components/app/page-shell"
import { useSetBreadcrumbLabel } from "@/components/app/breadcrumb-override.context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"

import { adminApi } from "../api/admin.api"
import { AdminFaqBarItem } from "../components/admin-faq-bar-item"
import {
  useAdminFaqDocument,
  useAdminFaqDocumentFaqs,
} from "../hooks/use-admin-faq"
import type { FaqDocument } from "../types/faq.types"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

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

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  )
}

export default function AdminFaqDocumentDetailPage() {
  const { documentId = "" } = useParams()
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")

  const { data: doc, isLoading, isError } = useAdminFaqDocument(documentId)
  const { data: faqs, isLoading: faqsLoading } = useAdminFaqDocumentFaqs(documentId)

  useSetBreadcrumbLabel((doc as FaqDocument | undefined)?.filename)

  const onDownload = async () => {
    try {
      const response = await adminApi.downloadFaqDocument(documentId)
      const blob = response.data as Blob
      const filename =
        (doc as FaqDocument | undefined)?.filename?.trim() || "document"
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toastApiError(error, "admin:faq.downloadError")
    }
  }

  if (isLoading) {
    return (
      <PageShell>
        <p className="text-muted-foreground">{tc("actions.loading")}</p>
      </PageShell>
    )
  }

  if (isError || !doc) {
    return (
      <PageShell>
        <p className="text-muted-foreground">{t("faq.documentNotFound")}</p>
      </PageShell>
    )
  }

  const faqDocument = doc as FaqDocument

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
              {faqDocument.filename}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("faq.documentDetail")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!faqDocument.storage_path}
            onClick={onDownload}
          >
            <Download className="size-4" aria-hidden />
            {t("faq.download")}
          </Button>
        </div>

        <div className={cn(panelClass, "grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3")}>
          <DetailField label={t("faq.columns.status")} value={faqDocument.status} />
          <DetailField label={t("faq.columns.faqCount")} value={faqDocument.faq_count} />
          <DetailField label={t("faq.columns.size")} value={formatBytes(faqDocument.file_size)} />
          <DetailField label={t("faq.columns.uploadedBy")} value={faqDocument.uploaded_by} />
          <DetailField label={t("faq.columns.createdAt")} value={formatDate(faqDocument.created_at)} />
          {faqDocument.error_message ? (
            <DetailField label={t("faq.error")} value={faqDocument.error_message} />
          ) : null}
        </div>

        <div className={cn(panelClass, "space-y-3 p-4")}>
          <h2 className="text-lg font-semibold">{t("faq.generatedFaqs")}</h2>
          {faqsLoading ? (
            <p className="text-sm text-muted-foreground">{tc("actions.loading")}</p>
          ) : faqs?.items.length ? (
            <ul className="flex flex-col gap-2">
              {faqs.items.map((faq) => (
                <li key={faq.id}>
                  <AdminFaqBarItem faq={faq} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("faq.emptyFaqs")}</p>
          )}
        </div>
      </div>
    </PageShell>
  )
}
