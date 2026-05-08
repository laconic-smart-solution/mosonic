type RecentItem = {
  label: string
  color: string
  initial: string
  updated: string
}

type HomeRecentRailProps = {
  items: readonly RecentItem[]
  hovRight: number | null
  onHover: (i: number | null) => void
  onSelect: () => void
}

export function HomeRecentRail({ items, hovRight, onHover, onSelect }: HomeRecentRailProps) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      {items.map((item, i) => (
        <div key={item.label} className="relative">
          <button
            type="button"
            onClick={onSelect}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            className="flex size-[52px] cursor-pointer items-center justify-center rounded-xl border bg-white transition-all duration-150"
            style={{
              borderColor: hovRight === i ? `${item.color}50` : "#EDE9E1",
              boxShadow:
                hovRight === i
                  ? `0 4px 16px ${item.color}20, 0 1px 3px rgba(0,0,0,0.06)`
                  : "0 1px 3px rgba(0,0,0,0.05)",
              transform: hovRight === i ? "scale(1.06)" : "scale(1)",
            }}
          >
            <div
              className="flex size-[30px] items-center justify-center rounded-lg text-xs font-bold"
              style={{
                background: `linear-gradient(135deg,${item.color}20,${item.color}35)`,
                border: `1.5px solid ${item.color}40`,
                color: item.color,
              }}
            >
              {item.initial}
            </div>
          </button>
          {hovRight === i ? (
            <div className="pointer-events-none absolute top-1/2 left-[62px] z-10 -translate-y-1/2 rounded-md bg-[#111118] px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              {item.label}
              <div className="mt-px text-[9px] text-white/50">{item.updated}</div>
              <div
                className="absolute top-1/2 -left-1.25 -translate-y-1/2 border-y-[5px] border-r-[5px] border-y-transparent border-r-[#111118]"
                aria-hidden
              />
            </div>
          ) : null}
        </div>
      ))}
      <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-[#718096] uppercase">Recent</div>
    </div>
  )
}
