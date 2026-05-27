export function HomeFooter() {
  return (
    <footer className="relative z-[1] flex items-center justify-between border-t border-border bg-background/80 px-6 py-3.5 backdrop-blur-sm">
      <span className="text-[11px] text-muted-foreground">© 2026 NeuralTex Co., Ltd. — Bangkok, Thailand</span>
      <div className="flex items-center gap-2.5">
        {(["EN", "TH"] as const).map((l, i) => (
          <span key={l} className="flex items-center gap-2.5">
            {i > 0 ? <span className="text-[11px] text-border">|</span> : null}
            <button type="button" className="cursor-pointer border-none bg-transparent p-0 text-[11px] font-medium text-muted-foreground">
              {l}
            </button>
          </span>
        ))}
      </div>
    </footer>
  )
}
