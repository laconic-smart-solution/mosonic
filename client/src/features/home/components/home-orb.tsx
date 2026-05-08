type HomeOrbProps = {
  orbPulse: boolean
}

export function HomeOrb({ orbPulse }: HomeOrbProps) {
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex size-[292px] items-center justify-center">
        <div
          className="absolute inset-0 rounded-full border border-dashed border-[#D8D5CE] [animation:ntSpin_20s_linear_infinite]"
          aria-hidden
        />
        <div className="absolute inset-2 rounded-full border border-[#EDE9E1] opacity-60" aria-hidden />
        <div
          className={[
            "relative flex size-[260px] items-center justify-center rounded-full border border-[#D9D3C7]",
            "bg-gradient-to-br from-white via-[#F4F1EB] to-[#EDE8DF]",
            "shadow-[0_8px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]",
            "transition-all duration-300",
            orbPulse ? "scale-[0.97]" : "scale-100",
          ].join(" ")}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle at 35% 30%, rgba(91,95,239,0.06) 0%, transparent 60%)",
            }}
            aria-hidden
          />
          <div className="relative z-[1] flex flex-col items-center gap-2.5">
            <div className="relative size-16">
              <div className="absolute inset-0 rounded-full border-[1.5px] border-[#D8D5CE]" aria-hidden />
              <div className="absolute inset-2.5 rounded-full border-[1.5px] border-[#00A589] opacity-40" aria-hidden />
              <div
                className="absolute inset-5 rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] shadow-[0_0_16px_#00A58940]"
                aria-hidden
              />
              <div className="absolute inset-7 rounded-full bg-white opacity-90" aria-hidden />
              <div
                className="absolute top-[10%] left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-[#00A589] shadow-[0_0_6px_#00A589] [animation:ntOrbitDot_4s_linear_infinite]"
                aria-hidden
              />
            </div>
            <div className="text-center">
              <div className="text-[13px] font-bold tracking-[2px] text-[#111118] uppercase">NeuralTex</div>
              <div className="mt-px text-[9px] font-semibold tracking-wide text-[#00A589] uppercase">AI Platform</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
