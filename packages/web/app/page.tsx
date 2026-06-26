import { auth } from '@/lib/auth'
import { Navbar } from './_marketing/Navbar'
import { HeroSection } from './_marketing/HeroSection'
import { DemoMockup } from './_marketing/DemoMockup'
import { FeaturesSection } from './_marketing/FeaturesSection'
import { HowItWorks } from './_marketing/HowItWorks'
import { ReviewSection } from './_marketing/ReviewSection'
import { TrustBadges } from './_marketing/TrustBadges'
import { AudienceSection } from './_marketing/AudienceSection'
import { DocsSection } from './_marketing/DocsSection'
import { CTASection } from './_marketing/CTASection'
import { Footer } from './_marketing/Footer'

export default async function LandingPage() {
  const session = await auth()
  const isLoggedIn = !!session?.user

  return (
    <div className="wood-floor overflow-x-hidden">
      <Navbar isLoggedIn={isLoggedIn} />

      <main>
        <HeroSection isLoggedIn={isLoggedIn} />

        {/* One-liner pitch — paper card pinned with tape */}
        <section className="wood-floor py-16 px-6">
          <div className="max-w-2xl mx-auto relative">
            {/* Tape pins at top corners */}
            <div className="tape absolute -top-2 left-8 w-16 h-3.5 rotate-[-5deg] z-10" />
            <div className="tape-cool tape absolute -top-2 right-8 w-14 h-3.5 rotate-[4deg] z-10" />

            <div className="paper rounded-sm shadow-2xl px-10 py-9 relative">
              <span
                className="block mb-2 text-[0.82rem] opacity-70"
                style={{ fontFamily: 'var(--font-hand)', color: '#8a6a44', letterSpacing: '0.05em' }}
              >
                the whole idea
              </span>
              <p
                className="leading-relaxed"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.1rem,2.2vw,1.5rem)', color: '#2a1c0e', lineHeight: 1.6 }}
              >
                Browser devtools let you experiment, but changes{' '}
                <em style={{ fontStyle: 'normal', color: '#7a4a18' }}>evaporate on reload.</em>{' '}
                Patchly closes that gap, the changes land in your actual source file
                and hot-reload instantly.
              </p>
            </div>
          </div>
        </section>

        <DemoMockup />
        <FeaturesSection />
        <HowItWorks />
        <ReviewSection />
        <TrustBadges />
        <AudienceSection />
        <DocsSection />
        <CTASection isLoggedIn={isLoggedIn} />
      </main>

      <Footer />
    </div>
  )
}
