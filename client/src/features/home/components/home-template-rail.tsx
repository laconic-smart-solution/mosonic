import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { HomeTemplate } from "@/features/home/data/home-constants"

type HomeTemplateRailProps = {
  templates: HomeTemplate[]
  hovLeft: number | null
  onHover: (i: number | null) => void
  onNavigate: (path: string) => void
  layout?: "vertical" | "horizontal"
}

export function HomeTemplateRail({
  templates,
  hovLeft,
  onHover,
  onNavigate,
  layout = "vertical",
}: HomeTemplateRailProps) {
  const { t } = useTranslation("home")
  const isHorizontal = layout === "horizontal"

  return (
    <div
      className={cn(
        isHorizontal ? "flex w-full flex-col gap-2" : "flex flex-col items-center gap-2.5",
      )}
    >
      {isHorizontal ? (
        <div className="text-center text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
          {t("templates.railLabel")}
        </div>
      ) : null}
      <div
        className={cn(
          isHorizontal
            ? "flex w-full justify-center gap-2 overflow-x-auto pb-1"
            : "flex flex-col items-center gap-2.5",
        )}
      >
        {templates.map((item, i) => (
          <Tooltip key={item.path}>
            <TooltipTrigger>
              <button
                type="button"
                onClick={() => onNavigate(item.path)}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card transition-all duration-150",
                  isHorizontal ? "size-11" : "size-[52px]",
                )}
                style={{
                  borderColor: hovLeft === i ? `${item.color}60` : undefined,
                  color: item.color,
                  boxShadow:
                    hovLeft === i
                      ? `0 4px 16px ${item.color}25, 0 1px 3px rgba(0,0,0,0.06)`
                      : "0 1px 3px rgba(0,0,0,0.05)",
                  transform: hovLeft === i ? "scale(1.06)" : "scale(1)",
                }}
              >
                {item.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side={isHorizontal ? "top" : "right"}
              align="center"
              sideOffset={10}
              className="flex max-w-[min(280px,calc(100vw-6rem))] flex-col items-stretch gap-0.5 px-3 py-2"
            >
              <span className="font-semibold">{item.label}</span>
              <span className="text-[11px] text-background/80">{item.sub}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {!isHorizontal ? (
        <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
          {t("templates.railLabel")}
        </div>
      ) : null}
    </div>
  )
}
