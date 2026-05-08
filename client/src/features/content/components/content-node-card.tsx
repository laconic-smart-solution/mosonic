import { RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"

type Props = {
  title: string
  subtitle: string
  value: unknown
  kind: "text" | "image" | "video"
  onRerun: () => void
}

export function ContentNodeCard({ title, subtitle, value, kind, onRerun }: Props) {
  const mediaInput = typeof value === "string" && (kind === "image" || kind === "video") ? value : undefined
  const src = useFileObjectUrl(mediaInput)
  return (
    <Card className="rounded-xl">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Badge variant="outline">Generated</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {kind === "video" && src ? (
          <video src={src} controls className="aspect-video w-full rounded-lg bg-black object-cover" />
        ) : kind === "image" && src ? (
          <img src={src} alt={title} className="aspect-video w-full rounded-lg object-cover" />
        ) : (
          <pre className="wrap-break-word min-h-16 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs">
            {typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2)}
          </pre>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onRerun}>
          <RefreshCw className="size-4" />
          Re-run node
        </Button>
      </CardContent>
    </Card>
  )
}
