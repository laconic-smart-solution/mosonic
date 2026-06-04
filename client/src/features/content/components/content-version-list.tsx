import { Button } from "@/components/ui/button"

type Version = {
  versionNumber: number
  createdAt: string
}

type Props = {
  currentVersion: number
  versions: Version[]
  onRestore: (version: number) => void
}

export function ContentVersionList({ currentVersion, versions, onRestore }: Props) {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber)
  return (
    <div className="space-y-2">
      {sorted.map((version) => {
        const isCurrent = version.versionNumber === currentVersion
        return (
          <div key={version.versionNumber} className="rounded-lg border p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">v{version.versionNumber}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(version.createdAt).toLocaleString()}
                </p>
              </div>
              {isCurrent ? (
                <span className="text-[10px] font-medium text-emerald-600">Current</span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onRestore(version.versionNumber)}
                >
                  Restore
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
