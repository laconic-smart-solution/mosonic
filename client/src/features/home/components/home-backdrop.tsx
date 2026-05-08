import { HomeNetworkCanvas } from "@/features/home/components/home-network-canvas"

export function HomeBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <HomeNetworkCanvas />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(91,95,239,0.05) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(139,92,246,0.04) 0%, transparent 50%)",
        }}
      />
    </div>
  )
}
