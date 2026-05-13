import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { HomeTemplate } from "@/features/home/data/home-constants"

type HomeTemplateRailProps = {
  templates: HomeTemplate[]
  hovLeft: number | null
  onHover: (i: number | null) => void
  onNavigate: (path: string) => void
}

export function HomeTemplateRail({
  templates,
  hovLeft,
  onHover,
  onNavigate,
}: HomeTemplateRailProps) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      {templates.map((item, i) => (
        <Tooltip key={item.path}>
          <TooltipTrigger>
            <button
              type="button"
              onClick={() => onNavigate(item.path)}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              className="flex size-[52px] cursor-pointer items-center justify-center rounded-xl border bg-white transition-all duration-150"
              style={{
                borderColor: hovLeft === i ? `${item.color}60` : "#EDE9E1",
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
            side="right"
            align="center"
            sideOffset={10}
            className="flex max-w-[min(280px,calc(100vw-6rem))] flex-col items-stretch gap-0.5 px-3 py-2"
          >
            <span className="font-semibold">{item.label}</span>
            <span className="text-[11px] text-background/80">{item.sub}</span>
          </TooltipContent>
        </Tooltip>
      ))}
      <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-[#718096] uppercase">
        Templates
      </div>
    </div>
  )
}
