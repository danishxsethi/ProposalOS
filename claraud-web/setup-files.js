const fs = require('fs');
const path = require('path');

const files = {
    // Pages
    'src/app/scan/page.tsx': `export default function Scan() { return <h1 className="text-center mt-20 text-2xl font-bold">Scan Input</h1>; }`,
    'src/app/scan/[token]/page.tsx': `export default function ScanProgress() { return <h1 className="text-center mt-20 text-2xl font-bold">Live Scan Progress</h1>; }`,
    'src/app/report/[token]/page.tsx': `export default function Report() { return <h1 className="text-center mt-20 text-2xl font-bold">Report Card</h1>; }`,
    'src/app/proposal/[token]/page.tsx': `export default function Proposal() { return <h1 className="text-center mt-20 text-2xl font-bold">Proposal Page</h1>; }`,
    'src/app/pricing/page.tsx': `export default function Pricing() { return <h1 className="text-center mt-20 text-2xl font-bold">Pricing</h1>; }`,
    'src/app/agencies/page.tsx': `export default function Agencies() { return <h1 className="text-center mt-20 text-2xl font-bold">Agencies Landing</h1>; }`,
    'src/app/login/page.tsx': `export default function Login() { return <h1 className="text-center mt-20 text-2xl font-bold">Login</h1>; }`,
    'src/app/dashboard/page.tsx': `export default function Dashboard() { return <h1 className="text-center mt-20 text-2xl font-bold">Dashboard</h1>; }`,
    'src/app/not-found.tsx': `export default function NotFound() { return <h1 className="text-center mt-20 text-2xl font-bold">404 - Not Found</h1>; }`,

    // Routes
    'src/app/api/scan/route.ts': `import { NextResponse } from 'next/server';\nexport async function POST() { return NextResponse.json({ status: 'ok' }); }`,
    'src/app/api/scan-status/[token]/route.ts': `import { NextResponse } from 'next/server';\nexport async function GET() { return NextResponse.json({ status: 'ok' }); }`,
    'src/app/api/report/[token]/route.ts': `import { NextResponse } from 'next/server';\nexport async function GET() { return NextResponse.json({ status: 'ok' }); }`,
    'src/app/api/lead/route.ts': `import { NextResponse } from 'next/server';\nexport async function POST() { return NextResponse.json({ status: 'ok' }); }`,
    'src/app/api/og/[token]/route.ts': `import { NextResponse } from 'next/server';\nexport async function GET() { return new NextResponse('OG'); }`,
    'src/app/api/webhook/stripe/route.ts': `import { NextResponse } from 'next/server';\nexport async function POST() { return NextResponse.json({ status: 'ok' }); }`,

    // Components (just empty or basic exports)
    'src/components/layout/navbar.tsx': `export function Navbar() { return <nav></nav>; }`,
    'src/components/layout/footer.tsx': `export function Footer() { return <footer></footer>; }`,
    'src/components/layout/sticky-scan-bar.tsx': `export function StickyScanBar() { return <div></div>; }`,

    'src/components/home/hero.tsx': `export function Hero() { return <section></section>; }`,
    'src/components/home/problem-section.tsx': `export function ProblemSection() { return <section></section>; }`,
    'src/components/home/how-it-works.tsx': `export function HowItWorks() { return <section></section>; }`,
    'src/components/home/what-we-audit.tsx': `export function WhatWeAudit() { return <section></section>; }`,
    'src/components/home/social-proof.tsx': `export function SocialProof() { return <section></section>; }`,
    'src/components/home/industry-verticals.tsx': `export function IndustryVerticals() { return <section></section>; }`,
    'src/components/home/pricing-preview.tsx': `export function PricingPreview() { return <section></section>; }`,
    'src/components/home/agency-cta.tsx': `export function AgencyCta() { return <section></section>; }`,
    'src/components/home/final-cta.tsx': `export function FinalCta() { return <section></section>; }`,

    'src/components/scan/scan-input.tsx': `export function ScanInput() { return <div></div>; }`,
    'src/components/scan/scan-progress.tsx': `export function ScanProgressDisplay() { return <div></div>; }`,
    'src/components/scan/email-gate.tsx': `export function EmailGate() { return <div></div>; }`,

    'src/components/report/score-overview.tsx': `export function ScoreOverview() { return <div></div>; }`,
    'src/components/report/radar-chart.tsx': `export function RadarChart() { return <div></div>; }`,
    'src/components/report/findings-list.tsx': `export function FindingsList() { return <div></div>; }`,
    'src/components/report/competitor-table.tsx': `export function CompetitorTable() { return <div></div>; }`,
    'src/components/report/report-cta.tsx': `export function ReportCta() { return <div></div>; }`,

    'src/components/shared/section-wrapper.tsx': `export function SectionWrapper({ children }: { children: React.ReactNode }) { return <section>{children}</section>; }`,
    'src/components/shared/animated-counter.tsx': `export function AnimatedCounter() { return <span>0</span>; }`,
    'src/components/shared/severity-badge.tsx': `export function SeverityBadge() { return <span>Badge</span>; }`,

    // Lib
    'src/lib/constants.ts': `export const AUDIT_CATEGORIES = [];\nexport const NAV_LINKS = [];\nexport const PRICING_TIERS = {};`,
    'src/lib/posthog.ts': `export const posthog = {};`,
    'src/lib/resend.ts': `export const resend = {};`,
    'src/lib/stripe.ts': `export const stripe = {};`,
    'src/lib/api-client.ts': `export const apiClient = {};`,
    'src/lib/types.ts': `export interface ScanRequest {}\nexport interface ScanStatus {}\nexport interface ModuleStatus {}\nexport interface ReportData {}\nexport interface CategoryScore {}\nexport interface Finding {}\nexport interface Competitor {}\nexport interface Lead {}`,

    // Hooks
    'src/hooks/use-scan-progress.ts': `export function useScanProgress() { return {}; }`,
    'src/hooks/use-posthog.ts': `export function usePostHogCapture() { return {}; }`,

    // Providers
    'src/providers/theme-provider.tsx': `export function ThemeProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }`,
    'src/providers/posthog-provider.tsx': `export function PostHogProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }`,
};

for (const [filepath, content] of Object.entries(files)) {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filepath, content);
}

console.log('Created placeholder files.');
