import type { HomeTemplate } from "@/features/home/data/home-constants"

type HomeTemplateRailProps = {
  templates: HomeTemplate[]
  hovLeft: number | null
  onHover: (i: number | null) => void
  onSelect: () => void
}

export function HomeTemplateRail({ templates, hovLeft, onHover, onSelect }: HomeTemplateRailProps) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      {templates.map((item, i) => (
        <div key={item.label} className="relative">
          <button
            type="button"
            onClick={onSelect}
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
          {hovLeft === i ? (
            <div className="pointer-events-none absolute top-1/2 right-[62px] z-10 -translate-y-1/2 rounded-md bg-[#111118] px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              {item.label}
              <div className="mt-px text-[9px] text-white/50">{item.sub}</div>
              <div
                className="absolute top-1/2 -right-1.25 -translate-y-1/2 border-y-[5px] border-l-[5px] border-y-transparent border-l-[#111118]"
                aria-hidden
              />
            </div>
          ) : null}
        </div>
      ))}
      <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-[#718096] uppercase">Templates</div>
    </div>
  )
}
