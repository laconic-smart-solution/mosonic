export function HomeFooter() {
  return (
    <footer className="relative z-[1] flex items-center justify-between border-t border-[#EDE9E1] px-6 py-3.5">
      <span className="text-[11px] text-[#718096]">© 2026 NeuralTex Co., Ltd. — Bangkok, Thailand</span>
      <div className="flex items-center gap-2.5">
        {(["EN", "TH"] as const).map((l, i) => (
          <span key={l} className="flex items-center gap-2.5">
            {i > 0 ? <span className="text-[11px] text-[#D9D3C7]">|</span> : null}
            <button type="button" className="cursor-pointer border-none bg-transparent p-0 text-[11px] font-medium text-[#718096]">
              {l}
            </button>
          </span>
        ))}
      </div>
    </footer>
  )
}
