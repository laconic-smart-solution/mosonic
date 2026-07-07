import { LandingAboutSection } from "@/features/marketing/components/landing/landing-about-section"
import { LandingCtaSection } from "@/features/marketing/components/landing/landing-cta-section"
import { LandingFeaturesSection } from "@/features/marketing/components/landing/landing-features-section"
import { LandingHeroSection } from "@/features/marketing/components/landing/landing-hero-section"
import { LandingHowItWorksSection } from "@/features/marketing/components/landing/landing-how-it-works-section"
import { LandingProblemSection } from "@/features/marketing/components/landing/landing-problem-section"
import { useScrollToHash } from "@/features/marketing/lib/use-scroll-to-hash"
import { LandingFloatingLeavesCanvas } from "../components/landing/landing-floating-leaves-canvas"

export default function LandingPage() {
  useScrollToHash()

  return (
    <div className="relative">
      <LandingFloatingLeavesCanvas />
      <div className="relative z-[1]">
        <LandingHeroSection />
        <LandingProblemSection />
        <LandingFeaturesSection />
        <LandingHowItWorksSection />
        <LandingAboutSection />
        <LandingCtaSection />
      </div>
    </div>
  )
}
