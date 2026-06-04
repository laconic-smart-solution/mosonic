import { GitBranch, History } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"

type Props = {
  contentId: string
  status: string
  currentVersion: number
  updatedAt: string
  onVersionClick: () => void
}

export function ContentDetailHeader({
  contentId,
  status,
  currentVersion,
  updatedAt,
  onVersionClick,
}: Props) {
  return (
    <div className="mb-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content {contentId}</h1>
          <p className="text-sm text-muted-foreground">
            Last edited {new Date(updatedAt).toLocaleString()}
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {status}
        </Badge>
      </div>

      <ButtonGroup>
        <Button type="button" variant="outline" size="sm" onClick={onVersionClick}>
          <GitBranch className="size-4" />
          v{currentVersion} current
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onVersionClick}>
          <History className="size-4" />
          History
        </Button>
      </ButtonGroup>
    </div>
  )
}
