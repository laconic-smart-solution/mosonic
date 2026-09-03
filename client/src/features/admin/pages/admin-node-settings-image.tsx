import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { PageShell } from "@/components/app/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"
import { FileServiceImage } from "@/features/upload/components/upload-display-media"

import {
  useAdminImageDesignStyleCreate,
  useAdminImageDesignStyleDelete,
  useAdminImageDesignStyleUpdate,
  useAdminImageDesignStyles,
  useAdminImageTemplateCreate,
  useAdminImageTemplateDelete,
  useAdminImageTemplateUpdate,
  useAdminImageTemplates,
  type AdminImageDesignStyle,
  type AdminImageTemplate,
} from "../hooks/use-admin-image-node-settings"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

/** Fixed set the config zod schema + classifier accept — "auto" is a sentinel, not a row. */
const TEMPLATE_KEYS = [
  "ad_creative",
  "product_mockup",
  "infographic",
  "photorealistic",
  "lifestyle",
] as const

type FormState = {
  key: string
  name: string
  description: string
  prompt: string
  isActive: boolean
}

const emptyForm = (key = ""): FormState => ({
  key,
  name: "",
  description: "",
  prompt: "",
  isActive: true,
})

function rowToForm(row: AdminImageTemplate | AdminImageDesignStyle): FormState {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    isActive: row.isActive,
  }
}

function buildFormData(form: FormState, imageFile: File | null): FormData {
  const fd = new FormData()
  fd.append("name", form.name.trim())
  fd.append("description", form.description.trim())
  fd.append("prompt", form.prompt.trim())
  fd.append("isActive", String(form.isActive))
  if (imageFile) fd.append("image", imageFile)
  return fd
}

/** Holds the raw File locally — the server uploads it and resolves imageUrl itself on submit. */
function ImageUploadField({
  file,
  existingUrl,
  onFileChange,
}: {
  file: File | null
  existingUrl: string
  onFileChange: (file: File) => void
}) {
  const { t } = useTranslation("admin")
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState("")

  useEffect(() => {
    if (!file) {
      setPreviewUrl("")
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const displayUrl = previewUrl || existingUrl

  return (
    <div className="grid gap-2">
      <Label>{t("nodeSettingsImage.fields.image")}</Label>
      <div className="flex items-center gap-3">
        {displayUrl ? (
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border">
            <FileServiceImage
              url={displayUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
              loadingClassName="absolute inset-0 flex size-full items-center justify-center bg-muted/30 text-[9px] text-muted-foreground"
            />
          </div>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
            {t("nodeSettingsImage.fields.noImage")}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          {displayUrl
            ? t("nodeSettingsImage.fields.replaceImage")
            : t("nodeSettingsImage.fields.uploadImage")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            if (picked) onFileChange(picked)
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}

function RowsTable({
  rows,
  isLoading,
  isError,
  emptyLabel,
  loadErrorLabel,
  onEdit,
  onDelete,
}: {
  rows: (AdminImageTemplate | AdminImageDesignStyle)[]
  isLoading: boolean
  isError: boolean
  emptyLabel: string
  loadErrorLabel: string
  onEdit: (row: AdminImageTemplate | AdminImageDesignStyle) => void
  onDelete: (row: AdminImageTemplate | AdminImageDesignStyle) => void
}) {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[64px]" />
          <TableHead>{t("nodeSettingsImage.columns.key")}</TableHead>
          <TableHead>{t("nodeSettingsImage.columns.name")}</TableHead>
          <TableHead>{t("nodeSettingsImage.columns.description")}</TableHead>
          <TableHead>{t("nodeSettingsImage.columns.status")}</TableHead>
          <TableHead className="w-[140px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground">
              {tc("actions.loading")}
            </TableCell>
          </TableRow>
        ) : isError ? (
          <TableRow>
            <TableCell colSpan={6} className="text-destructive">
              {loadErrorLabel}
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground">
              {emptyLabel}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const id =
              "imageTemplateId" in row ? row.imageTemplateId : row.imageDesignStyleId
            return (
              <TableRow key={id}>
                <TableCell>
                  {row.imageUrl ? (
                    <div className="relative size-10 overflow-hidden rounded-md border border-border">
                      <FileServiceImage
                        url={row.imageUrl}
                        alt=""
                        className="absolute inset-0 size-full object-cover"
                        loadingClassName="absolute inset-0 flex size-full items-center justify-center bg-muted/30 text-[8px] text-muted-foreground"
                      />
                    </div>
                  ) : (
                    <div className="size-10 rounded-md border border-dashed border-border" />
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.key}</TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                  {row.description}
                </TableCell>
                <TableCell>
                  <Badge variant={row.isActive ? "default" : "secondary"}>
                    {row.isActive
                      ? t("nodeSettingsImage.active")
                      : t("nodeSettingsImage.inactive")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(row)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(row)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}

function TemplatesSection() {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const { data: rows = [], isLoading, isError } = useAdminImageTemplates()
  const createRow = useAdminImageTemplateCreate()
  const updateRow = useAdminImageTemplateUpdate()
  const deleteRow = useAdminImageTemplateDelete()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminImageTemplate | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [existingImageUrl, setExistingImageUrl] = useState("")

  const usedKeys = new Set(rows.map((r) => r.key))
  const availableKeys = TEMPLATE_KEYS.filter((k) => !usedKeys.has(k))

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm(availableKeys[0] ?? ""))
    setImageFile(null)
    setExistingImageUrl("")
    setDialogOpen(true)
  }

  const openEdit = (row: AdminImageTemplate) => {
    setEditing(row)
    setForm(rowToForm(row))
    setImageFile(null)
    setExistingImageUrl(row.imageUrl ?? "")
    setDialogOpen(true)
  }

  const submit = () => {
    const formData = buildFormData(form, imageFile)
    if (editing) {
      updateRow.mutate(
        { id: editing.imageTemplateId, formData },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (error) =>
            toastApiError(error, t("nodeSettingsImage.templates.saveError")),
        },
      )
      return
    }
    formData.append("key", form.key)
    createRow.mutate(formData, {
      onSuccess: () => setDialogOpen(false),
      onError: (error) =>
        toastApiError(error, t("nodeSettingsImage.templates.saveError")),
    })
  }

  const remove = (row: AdminImageTemplate) => {
    if (!window.confirm(t("nodeSettingsImage.templates.deleteConfirm", { name: row.name })))
      return
    deleteRow.mutate(row.imageTemplateId, {
      onError: (error) =>
        toastApiError(error, t("nodeSettingsImage.templates.deleteError")),
    })
  }

  const saving = createRow.isPending || updateRow.isPending

  return (
    <div className={cn(panelClass, "p-4 space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("nodeSettingsImage.templates.hint")}
        </p>
        <Button
          type="button"
          onClick={openCreate}
          disabled={availableKeys.length === 0}
        >
          <Plus className="size-4" aria-hidden />
          {t("nodeSettingsImage.templates.create")}
        </Button>
      </div>

      <RowsTable
        rows={rows}
        isLoading={isLoading}
        isError={isError}
        emptyLabel={t("nodeSettingsImage.templates.empty")}
        loadErrorLabel={t("nodeSettingsImage.templates.loadError")}
        onEdit={(row) => openEdit(row as AdminImageTemplate)}
        onDelete={(row) => remove(row as AdminImageTemplate)}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("nodeSettingsImage.templates.editTitle")
                : t("nodeSettingsImage.templates.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {!editing ? (
              <div className="grid gap-2">
                <Label htmlFor="tmpl-key">{t("nodeSettingsImage.fields.key")}</Label>
                <Select
                  value={form.key}
                  onValueChange={(value) => {
                    if (value) setForm((prev) => ({ ...prev, key: value }))
                  }}
                >
                  <SelectTrigger id="tmpl-key" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableKeys.map((key) => (
                      <SelectItem key={key} value={key}>
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="tmpl-name">{t("nodeSettingsImage.fields.name")}</Label>
              <Input
                id="tmpl-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tmpl-desc">
                {t("nodeSettingsImage.fields.description")}
              </Label>
              <Textarea
                id="tmpl-desc"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tmpl-prompt">{t("nodeSettingsImage.fields.prompt")}</Label>
              <Textarea
                id="tmpl-prompt"
                rows={4}
                value={form.prompt}
                onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
              />
            </div>
            <ImageUploadField
              file={imageFile}
              existingUrl={existingImageUrl}
              onFileChange={setImageFile}
            />
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <Label htmlFor="tmpl-active">
                {t("nodeSettingsImage.fields.active")}
              </Label>
              <Switch
                id="tmpl-active"
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={saving || !form.key}>
              {tc("actions.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DesignStylesSection() {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const { data: rows = [], isLoading, isError } = useAdminImageDesignStyles()
  const createRow = useAdminImageDesignStyleCreate()
  const updateRow = useAdminImageDesignStyleUpdate()
  const deleteRow = useAdminImageDesignStyleDelete()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminImageDesignStyle | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [existingImageUrl, setExistingImageUrl] = useState("")

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setImageFile(null)
    setExistingImageUrl("")
    setDialogOpen(true)
  }

  const openEdit = (row: AdminImageDesignStyle) => {
    setEditing(row)
    setForm(rowToForm(row))
    setImageFile(null)
    setExistingImageUrl(row.imageUrl ?? "")
    setDialogOpen(true)
  }

  const submit = () => {
    const formData = buildFormData(form, imageFile)
    if (editing) {
      updateRow.mutate(
        { id: editing.imageDesignStyleId, formData },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (error) =>
            toastApiError(error, t("nodeSettingsImage.styles.saveError")),
        },
      )
      return
    }
    formData.append("key", form.key.trim().toLowerCase())
    createRow.mutate(formData, {
      onSuccess: () => setDialogOpen(false),
      onError: (error) =>
        toastApiError(error, t("nodeSettingsImage.styles.saveError")),
    })
  }

  const remove = (row: AdminImageDesignStyle) => {
    if (!window.confirm(t("nodeSettingsImage.styles.deleteConfirm", { name: row.name })))
      return
    deleteRow.mutate(row.imageDesignStyleId, {
      onError: (error) =>
        toastApiError(error, t("nodeSettingsImage.styles.deleteError")),
    })
  }

  const saving = createRow.isPending || updateRow.isPending

  return (
    <div className={cn(panelClass, "p-4 space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("nodeSettingsImage.styles.hint")}</p>
        <Button type="button" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          {t("nodeSettingsImage.styles.create")}
        </Button>
      </div>

      <RowsTable
        rows={rows}
        isLoading={isLoading}
        isError={isError}
        emptyLabel={t("nodeSettingsImage.styles.empty")}
        loadErrorLabel={t("nodeSettingsImage.styles.loadError")}
        onEdit={(row) => openEdit(row as AdminImageDesignStyle)}
        onDelete={(row) => remove(row as AdminImageDesignStyle)}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("nodeSettingsImage.styles.editTitle")
                : t("nodeSettingsImage.styles.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {!editing ? (
              <div className="grid gap-2">
                <Label htmlFor="style-key">{t("nodeSettingsImage.fields.key")}</Label>
                <Input
                  id="style-key"
                  value={form.key}
                  onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
                  placeholder="cyberpunk"
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="style-name">{t("nodeSettingsImage.fields.name")}</Label>
              <Input
                id="style-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="style-desc">
                {t("nodeSettingsImage.fields.description")}
              </Label>
              <Textarea
                id="style-desc"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="style-prompt">
                {t("nodeSettingsImage.fields.prompt")}
              </Label>
              <Textarea
                id="style-prompt"
                rows={4}
                value={form.prompt}
                onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
              />
            </div>
            <ImageUploadField
              file={imageFile}
              existingUrl={existingImageUrl}
              onFileChange={setImageFile}
            />
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <Label htmlFor="style-active">
                {t("nodeSettingsImage.fields.active")}
              </Label>
              <Switch
                id="style-active"
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={saving || !form.key.trim()}>
              {tc("actions.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const TAB_IDS = ["templates", "styles"] as const
type TabId = (typeof TAB_IDS)[number]

function parseTab(value: string | null): TabId {
  if (value && (TAB_IDS as readonly string[]).includes(value)) {
    return value as TabId
  }
  return "templates"
}

export default function AdminNodeSettingsImagePage() {
  const { t } = useTranslation("admin")
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseTab(searchParams.get("tab"))

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("nodeSettingsImage.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("nodeSettingsImage.subtitle")}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
          <TabsList variant="default" aria-label={t("nodeSettingsImage.title")}>
            {TAB_IDS.map((tabId) => (
              <TabsTrigger key={tabId} value={tabId}>
                {t(`nodeSettingsImage.tabs.${tabId}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {activeTab === "templates" ? <TemplatesSection /> : <DesignStylesSection />}
      </div>
    </PageShell>
  )
}
