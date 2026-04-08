import { SectionWrapper } from '@/components/shared/section-wrapper';

export const metadata = {
    title: 'Terms of Service | Claraud',
    description: 'Terms of service and usage conditions for Claraud AI Audit.',
};

export default function TermsPage() {
    return (
        <div className="bg-[#0a0a0f] min-h-screen pt-32 pb-20">
            <SectionWrapper>
                <div className="max-w-3xl mx-auto px-4 prose prose-invert">
                    <h1 className="text-4xl font-bold text-white mb-8">Terms of Service</h1>
                    <p className="text-text-secondary mb-12">Last updated: March 8, 2026</p>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
                        <p className="text-text-secondary">
                            By accessing or using claraud.com (the "Site") and our services, you agree to be bound by these 
                            Terms of Service. If you do not agree to all of these terms, do not use the Site or our services.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">2. Description of Service</h2>
                        <p className="text-text-secondary">
                            Claraud provides an AI-powered business audit tool that analyzes websites and online presence 
                            to provide performance insights and recommendations. We offer both free and paid service tiers.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">3. Usage Limitations</h2>
                        <div className="space-y-4">
                            <p className="text-text-secondary">
                                <strong>Free Tier:</strong> Limited to one free audit per business. Misuse or creation of 
                                multiple accounts to bypass this limit is prohibited.
                            </p>
                            <p className="text-text-secondary">
                                <strong>Acceptable Use:</strong> You agree not to use the service for any unlawful purpose, 
                                including but not limited to scraping, excessive API requests, or attempting to reverse 
                                engineer our audit engine.
                            </p>
                        </div>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">4. Paid Tiers & Refunds</h2>
                        <ul className="list-disc pl-6 text-text-secondary space-y-2">
                            <li>Payments are processed securely via Stripe.</li>
                            <li><strong>7-Day Refund Policy:</strong> If you are not satisfied with your paid audit report, 
                            you may request a 100% refund within 7 days of purchase. No questions asked.</li>
                            <li>Subscriptions (for Agency plans) can be cancelled at any time through your dashboard.</li>
                        </ul>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">5. Intellectual Property</h2>
                        <p className="text-text-secondary">
                            The Site, its original content, features, and functionality are owned by Claraud and are 
                            protected by international copyright, trademark, patent, and other intellectual property laws. 
                            Audit reports provided to you are for your internal business use or client delivery (for Agency plans only).
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">6. Limitation of Liability</h2>
                        <p className="text-text-secondary">
                            Claraud provides data and recommendations based on AI analysis. We do not guarantee specific 
                            business outcomes or rankings. In no event shall Claraud be liable for any indirect, 
                            incidental, or consequential damages arising out of your use of our service.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">7. Governing Law</h2>
                        <p className="text-text-secondary">
                            These terms shall be governed by and defined in accordance with the laws of Saskatchewan, Canada. 
                            Any disputes shall be resolved in the courts of Saskatoon, SK.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-2xl font-bold text-white mb-4">8. Contact</h2>
                        <p className="text-text-secondary">
                            For any questions regarding these terms, please contact us at:
                            <br />
                            <strong>Email:</strong> legal@claraud.com
                        </p>
                    </section>
                </div>
            </SectionWrapper>
        </div>
    );
}
