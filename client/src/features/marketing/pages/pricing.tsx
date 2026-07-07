import { LandingFloatingLeavesCanvas } from "@/features/marketing/components/landing/landing-floating-leaves-canvas"
import { PricingHeroSection } from "@/features/marketing/components/pricing/pricing-hero-section"
import { PricingPlansSection } from "@/features/marketing/components/pricing/pricing-plans-section"

export default function PricingPage() {
  return (
    <div className="relative">
      <LandingFloatingLeavesCanvas />
      <div className="relative z-[1]">
        <PricingHeroSection />
        <PricingPlansSection />
      </div>
    </div>
  )
}
