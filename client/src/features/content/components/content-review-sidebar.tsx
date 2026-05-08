import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ContentVersionList } from "./content-version-list"

type Props = {
  status: string
  workflowRef: string
  ruleRef: string
  pipelineRef: string
  currentVersion: number
  versions: Array<{ versionNumber: number; createdAt: string }>
  nodeStatuses: Array<{ name: string; state: "done" | "pending" }>
  onApprove: () => void
  onReject: () => void
  onRestoreVersion: (version: number) => void
}

export function ContentReviewSidebar({
  status,
  workflowRef,
  ruleRef,
  pipelineRef,
  currentVersion,
  versions,
  nodeStatuses,
  onApprove,
  onReject,
  onRestoreVersion,
}: Props) {
  return (
    <div className="w-[320px] shrink-0 border-l bg-background">
      <div className="space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Review Decision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="outline" className="capitalize">
              {status}
            </Badge>
            <Button className="w-full" onClick={onApprove}>
              Approve & Send to Upload
            </Button>
            <Button variant="outline" className="w-full" onClick={onReject}>
              Reject Draft
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Content Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p><span className="text-muted-foreground">Workflow:</span> {workflowRef}</p>
            <p><span className="text-muted-foreground">Rule:</span> {ruleRef}</p>
            <p><span className="text-muted-foreground">Pipeline:</span> {pipelineRef}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ContentVersionList
              currentVersion={currentVersion}
              versions={versions}
              onRestore={onRestoreVersion}
            />
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Node Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nodeStatuses.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span>{item.name}</span>
                <Badge variant="outline" className="capitalize">
                  {item.state}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
