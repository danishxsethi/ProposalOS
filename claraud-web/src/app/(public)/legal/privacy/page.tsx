import { SectionWrapper } from '@/components/shared/section-wrapper';

export const metadata = {
  title: 'Privacy Policy | Claraud',
  description: 'Privacy policy and data protection information for Claraud AI Audit.',
};

export default function PrivacyPage() {
  return (
    <div className="bg-[#0a0a0f] min-h-screen pt-32 pb-20">
      <SectionWrapper>
        <div className="max-w-3xl mx-auto px-4 prose prose-invert">
          <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
          <p className="text-text-secondary mb-12">Last updated: March 8, 2026</p>

          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
            <p className="text-text-secondary">
              Claraud ("we," "our," or "us") is committed to protecting your privacy. This Privacy
              Policy explains how we collect, use, and safeguard your information when you visit our
              website claraud.com and use our AI-powered audit services.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">2. Data We Collect</h2>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>
                <strong>Business Information:</strong> Website URLs, business names, and public
                profile data (Google Business Profile, social media links).
              </li>
              <li>
                <strong>Contact Data:</strong> Your email address when you request a full report or
                sign up for our newsletter.
              </li>
              <li>
                <strong>Scan Results:</strong> Data generated during the audit process, including
                performance metrics and SEO analysis.
              </li>
              <li>
                <strong>Usage Data:</strong> Information on how you interact with our site,
                collected via PostHog analytics.
              </li>
              <li>
                <strong>Cookies:</strong> We use PostHog analytics cookies to understand how you use
                our service.
              </li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Data</h2>
            <p className="text-text-secondary">We use the collected data to:</p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>Generate and provide your AI business audit reports.</li>
              <li>Communicate with you regarding your reports and our services.</li>
              <li>Improve our audit engine and website performance.</li>
              <li>Ensure compliance with our terms of service and legal obligations.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">4. Third-Party Services</h2>
            <p className="text-text-secondary">
              We share data with the following essential providers to deliver our service:
            </p>
            <ul className="list-disc pl-6 text-text-secondary space-y-2">
              <li>
                <strong>Google Cloud & Vertex AI:</strong> For hosting and running our AI analysis.
              </li>
              <li>
                <strong>PostHog:</strong> For analyzing website traffic and user behavior.
              </li>
              <li>
                <strong>Resend:</strong> For sending email reports and notifications.
              </li>
              <li>
                <strong>Stripe:</strong> For processing payments on paid tiers.
              </li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">5. Data Retention</h2>
            <p className="text-text-secondary">
              Audit reports are stored for a period of 1 year to allow you to track your progress
              over time. Personal contact data is stored until you request its deletion. You may
              request data deletion at any time by emailing privacy@claraud.com.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">6. Legal Compliance</h2>
            <div className="space-y-4">
              <p className="text-text-secondary">
                <strong>GDPR (Europe):</strong> We respect all rights granted under the General Data
                Protection Regulation, including the right to access, rectify, and erase your
                personal data.
              </p>
              <p className="text-text-secondary">
                <strong>PIPEDA (Canada):</strong> As a Canadian-based company, we comply with the
                Personal Information Protection and Electronic Documents Act.
              </p>
            </div>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">7. Contact Us</h2>
            <p className="text-text-secondary">
              For any questions regarding this policy or to make a data request, please contact us
              at:
              <br />
              <strong>Email:</strong> privacy@claraud.com
            </p>
          </section>
        </div>
      </SectionWrapper>
    </div>
  );
}
