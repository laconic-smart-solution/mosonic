import { HomeNetworkCanvas } from "@/features/home/components/home-network-canvas"

export function HomeBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <HomeNetworkCanvas />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(91,95,239,0.05)_0%,transparent_50%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.04)_0%,transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(0,201,167,0.06)_0%,transparent_50%),radial-gradient(circle_at_80%_80%,rgba(37,76,148,0.08)_0%,transparent_50%)]"
        aria-hidden
      />
    </div>
  )
}
