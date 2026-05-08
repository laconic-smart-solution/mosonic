export function HomeUserStrip() {
  return (
    <div className="fixed top-0 right-0 z-20 flex items-center gap-2.5 p-4 pr-6">
      <span className="text-xs font-medium text-[#4A5568]">Apisit K.</span>
      <div className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-xs font-bold text-white shadow-[0_2px_8px_#00A58940]">
        A
      </div>
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#EDE9E1] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A5568] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        BKK Agency
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
          <path d="M1.5 3.5l3 3 3-3" stroke="#4A5568" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
