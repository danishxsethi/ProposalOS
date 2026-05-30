'use client';

import React, { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FolderCode,
  Globe,
  Loader2,
  Palette,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface TenantProps {
  id: string;
  name: string;
  planTier: string;
  status: string;
}

interface BrandingProps {
  brandName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

interface OnboardingWizardProps {
  tenant: TenantProps;
  branding?: BrandingProps | null;
  initialStep: number;
}

const COLOR_PRESETS = [
  { name: 'Lavender Indigo', primary: '#8B5CF6', secondary: '#38BDF8', accent: '#F59E0B' },
  { name: 'Emerald Mint', primary: '#10B981', secondary: '#34D399', accent: '#F59E0B' },
  { name: 'Sunset Orange', primary: '#F59E0B', secondary: '#EF4444', accent: '#8B5CF6' },
  { name: 'Rose Blush', primary: '#EC4899', secondary: '#F43F5E', accent: '#38BDF8' },
];

export default function OnboardingWizard({ tenant, branding, initialStep }: OnboardingWizardProps) {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);

  // Form State
  const [selectedVertical, setSelectedVertical] = useState<string>('');
  const [customVertical, setCustomVertical] = useState<string>('');
  const [brandName, setBrandName] = useState(branding?.brandName || tenant.name);
  const [primaryColor, setPrimaryColor] = useState(branding?.primaryColor || '#8B5CF6');
  const [secondaryColor, setSecondaryColor] = useState(branding?.secondaryColor || '#38BDF8');

  // Simulated Crawl State
  const [crawlStarted, setCrawlStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [crawlLogs, setCrawlLogs] = useState<
    { id: number; text: string; status: 'pending' | 'success' }[]
  >([]);

  // Fetch CSRF Token on Mount
  useEffect(() => {
    const getCsrf = async () => {
      try {
        const res = await fetch('/api/csrf');
        const data = await res.json();
        setCsrfToken(data.csrfToken);
      } catch (err) {
        console.error('Error fetching CSRF token:', err);
      }
    };
    getCsrf();
  }, []);

  // Update backend about step progress
  const persistStep = async (nextStep: number, payload?: any) => {
    try {
      await fetch('/api/onboarding/step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({
          step: nextStep,
          payload,
        }),
      });
    } catch (err) {
      console.error('Failed to persist onboarding step progress:', err);
    }
  };

  const handleNext = async () => {
    if (step === 4) {
      setLoading(true);
      const vertical = selectedVertical === 'custom' ? customVertical : selectedVertical;
      await persistStep(4, {
        vertical,
        brandName,
        colors: { primaryColor, secondaryColor },
      });
      router.push('/dashboard');
      return;
    }

    setLoading(true);
    const nextStep = step + 1;
    const vertical = selectedVertical === 'custom' ? customVertical : selectedVertical;
    await persistStep(nextStep, {
      vertical,
      brandName,
      colors: { primaryColor, secondaryColor },
    });
    setStep(nextStep);
    setLoading(false);
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // Run the Crawl walk-through simulation
  const startCrawlSimulation = () => {
    if (crawlStarted !== 'idle') return;
    setCrawlStatus('running');
    setCrawlProgress(5);

    const logsList = [
      'Initializing secure crawler context for target: gnu.org...',
      'Checking and fetching robots.txt and sitemap.xml rules...',
      'Downloading target HTML page, resolving redirects, and parsing DOM...',
      'Analyzing asset delivery pipeline (Core Web Vitals: LCP, INP, FID)...',
      'Validating SSL/TLS certificates, security headers, and domain trust...',
      'Parsing structured microdata, open-graph metadata, and schema tags...',
      'Crawl finished! Extracted 5 structured findings with photographic snapshots.',
    ];

    setCrawlLogs([{ id: 0, text: logsList[0] || '', status: 'pending' }]);

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx < logsList.length) {
        setCrawlLogs((prev) => {
          const updated = prev.map((log) => ({ ...log, status: 'success' as const }));
          return [...updated, { id: idx, text: logsList[idx] || '', status: 'pending' as const }];
        });
        setCrawlProgress(Math.floor((idx / logsList.length) * 100));
      } else {
        clearInterval(interval);
        setCrawlLogs((prev) => prev.map((log) => ({ ...log, status: 'success' as const })));
        setCrawlProgress(100);
        setCrawlStatus('done');
      }
    }, 900);
  };

  const isVerticalValid =
    selectedVertical && (selectedVertical !== 'custom' || customVertical.trim().length >= 2);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 flex flex-col justify-center items-center font-sans">
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.15); }
          50% { box-shadow: 0 0 35px rgba(139, 92, 246, 0.35); }
        }
        @keyframes float-micro {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .pulse-glow-violet {
          animation: pulse-glow 3s infinite ease-in-out;
        }
        .float-micro {
          animation: float-micro 4s infinite ease-in-out;
        }
        .progress-bar-glow {
          box-shadow: 0 0 10px var(--bar-glow-color, #8b5cf6);
        }
      `}</style>

      <div className="w-full max-w-4xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl rounded-3xl p-8 md:p-10 pulse-glow-violet float-micro">
        {/* Step Indicator */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-violet-400 font-semibold mb-1">
                Onboarding Wizard
              </p>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Set Up Your ProposalOS
              </h1>
            </div>
            <div className="text-sm font-medium bg-slate-800 border border-slate-700/60 px-3.5 py-1.5 rounded-full text-slate-300">
              Step <span className="text-violet-400 font-bold">{step}</span> of 4
            </div>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-sky-400 transition-all duration-500 ease-out progress-bar-glow"
              style={
                {
                  width: `${(step / 4) * 100}%`,
                  '--bar-glow-color': primaryColor,
                } as React.CSSProperties
              }
            />
          </div>
        </div>

        {/* STEP 1: WELCOME & VERTICAL */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="max-w-2xl">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-violet-400" /> Let&apos;s Pinpoint Your Vertical
              </h2>
              <p className="text-slate-400 text-sm md:text-base">
                Welcome, **{tenant.name}**! Choose the main business niche that represents your
                prospects. This selection automatically seeds customized playbooks, local target
                parameters, and AI-driven pricing templates.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              {[
                {
                  id: 'dental',
                  name: 'Dental & Orthodontics',
                  desc: 'Patient trust signals, HIPAA trust matrices, and calendar optimization.',
                  icon: Globe,
                },
                {
                  id: 'hvac',
                  name: 'HVAC & Plumbing',
                  desc: 'Emergency response, service area dominance, and seasonality matrices.',
                  icon: Settings,
                },
                {
                  id: 'legal',
                  name: 'Legal & Law Firms',
                  desc: 'Authority validation, case value estimations, and legal compliance.',
                  icon: FolderCode,
                },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVertical(v.id);
                    setCustomVertical('');
                  }}
                  className={`text-left p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                    selectedVertical === v.id
                      ? 'bg-violet-600/10 border-violet-500/80 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600'
                  }`}
                >
                  <div className="mb-4 inline-flex p-2 rounded-xl bg-slate-800 border border-slate-700 text-violet-400">
                    <v.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-white mb-1.5">{v.name}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{v.desc}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/80">
              <button
                onClick={() => setSelectedVertical('custom')}
                className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 ${
                  selectedVertical === 'custom'
                    ? 'bg-violet-600/10 border-violet-500/80 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                    : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-violet-400">
                    <Palette className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Custom Business Niche</h3>
                    <p className="text-xs text-slate-400">
                      Specify an alternative local service segment to configure customized prompts.
                    </p>
                  </div>
                </div>
              </button>

              {selectedVertical === 'custom' && (
                <div className="mt-4 p-5 bg-slate-800/30 border border-slate-800 rounded-2xl space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Custom Industry/Niche Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Chiropractic, Real Estate, Automotive Repair..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                    value={customVertical}
                    onChange={(e) => setCustomVertical(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: BRANDING SETUP */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="max-w-2xl">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <Palette className="w-6 h-6 text-violet-400" /> Customize Your Client-Facing Brand
              </h2>
              <p className="text-slate-400 text-sm md:text-base">
                Your prospects receive white-labeled proposal links. Tailor your company
                presentation style to evoke confidence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
              {/* Controls */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Company Brand Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Digital, LocalSEO Pros..."
                    className="w-full bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Color Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setPrimaryColor(preset.primary);
                          setSecondaryColor(preset.secondary);
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                          primaryColor === preset.primary && secondaryColor === preset.secondary
                            ? 'bg-slate-800 border-violet-500'
                            : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex -space-x-1.5">
                          <div
                            className="w-5 h-5 rounded-full border border-slate-900"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <div
                            className="w-5 h-5 rounded-full border border-slate-900"
                            style={{ backgroundColor: preset.secondary }}
                          />
                        </div>
                        <span className="text-xs font-medium text-white">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Primary Color
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-center focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Secondary Color
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="flex-1 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-center focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Real-time proposal preview mock card */}
              <div className="border border-slate-800 bg-slate-950/80 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden h-[330px]">
                <div
                  className="absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-10 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                />
                <div
                  className="absolute bottom-0 left-0 w-32 h-32 blur-[60px] opacity-10 rounded-full"
                  style={{ backgroundColor: secondaryColor }}
                />

                <div>
                  {/* Mock proposal nav */}
                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-3 mb-4">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: primaryColor }}
                      />
                      <span className="text-xs font-bold text-white tracking-wide">
                        {brandName || 'My Brand'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">PROPOSAL #031</div>
                  </div>

                  {/* Mock proposal banner */}
                  <div className="p-4 rounded-xl border border-white/5 bg-white/5 mb-4">
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1"
                      style={{ color: secondaryColor }}
                    >
                      Executive Analysis
                    </p>
                    <h3 className="text-sm font-bold text-white mb-2">
                      Growth & Search Audit for Acme Dental
                    </h3>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Prepared by{' '}
                      <span className="font-semibold text-white">{brandName || 'My Brand'}</span>.
                      Identifying $12,500/mo in scheduling leakages with actionable solutions.
                    </p>
                  </div>

                  {/* Mock content list */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-4 h-4" style={{ color: primaryColor }} />
                      <span className="text-slate-400 text-[11px]">
                        Core Web Vitals optimize (LCP: -1.2s)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-4 h-4" style={{ color: primaryColor }} />
                      <span className="text-slate-400 text-[11px]">
                        Structured schema injection
                      </span>
                    </div>
                  </div>
                </div>

                {/* Proposal CTA Button mock */}
                <div className="flex justify-between items-center border-t border-slate-800/80 pt-3 mt-4">
                  <span className="text-[11px] text-slate-500">Live Proposal Link Preview</span>
                  <button
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-950 flex items-center gap-1 transition-transform"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                    }}
                  >
                    Accept Proposal <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: GUIDED MOCK CRAWL */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="max-w-2xl">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <Search className="w-6 h-6 text-violet-400" /> Secure Guided Crawl Simulation
              </h2>
              <p className="text-slate-400 text-sm md:text-base">
                Let&apos;s run a mock visual inspection walkthrough on **gnu.org**. This showcases
                how ProposalOS extracts audit data, detects Core Web Vitals targets, and secures
                structural evidence snapshots.
              </p>
            </div>

            {/* Simulated terminal console */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 font-mono text-xs md:text-sm overflow-hidden flex flex-col justify-between h-[300px]">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="text-slate-500 text-xs font-semibold">
                  crawler-sandbox://gnu.org
                </div>
                <div className="px-2 py-0.5 rounded bg-violet-600/10 border border-violet-500/20 text-[10px] text-violet-400 font-bold tracking-wider">
                  ACTIVE
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-2 select-none">
                {crawlLogs.length === 0 && (
                  <div className="text-slate-500 text-center py-10">
                    <p className="mb-3 font-semibold">Sandbox isolated. No crawl running.</p>
                    <button
                      onClick={startCrawlSimulation}
                      className="px-5 py-2.5 rounded-xl border border-violet-500/40 hover:bg-violet-600/10 text-violet-300 font-bold text-xs transition-all tracking-wide inline-flex items-center gap-2"
                    >
                      <Loader2 className="w-4 h-4 animate-spin hidden" /> Launch Audit Simulation
                    </button>
                  </div>
                )}

                {crawlLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2.5 leading-relaxed text-slate-300"
                  >
                    {log.status === 'success' ? (
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-violet-400 animate-spin mt-0.5 flex-shrink-0" />
                    )}
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>

              {crawlStarted !== 'idle' && (
                <div className="border-t border-slate-800/80 pt-3.5 mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 w-1/2">
                    <div className="text-[11px] text-slate-500 font-semibold uppercase">
                      Progress:
                    </div>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-300"
                        style={{ width: `${crawlProgress}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-300 font-bold font-mono">
                      {crawlProgress}%
                    </div>
                  </div>
                  {crawlProgress === 100 && (
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      Crawl Success
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: GO LIVE */}
        {step === 4 && (
          <div className="space-y-6 text-center py-6">
            <div className="max-w-lg mx-auto flex flex-col items-center">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-5 float-micro shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                Onboarding Accomplished!
              </h2>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                Awesome! You are ready to go live. We have successfully initialized your tenant
                account, seeded the primary playbooks, and verified security rules.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mt-8">
              {[
                {
                  title: 'Secure Tenant Context',
                  desc: 'RLS row isolation completely active. No cross-tenant leakages.',
                  icon: ShieldAlert,
                },
                {
                  title: 'Seeded Playbooks',
                  desc: `${selectedVertical === 'custom' ? customVertical : selectedVertical.toUpperCase()} vertical playbooks created successfully.`,
                  icon: FolderCode,
                },
                {
                  title: 'Dashboard Active',
                  desc: 'Manage prospect pipelines, audits, and real-time proposal tracking.',
                  icon: Globe,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="p-5 rounded-2xl border border-slate-800 bg-slate-900/30 text-left space-y-2.5"
                >
                  <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700/60 inline-block text-violet-400">
                    <item.icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-white">{item.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex justify-between items-center border-t border-slate-800/80 pt-8 mt-10">
          {step > 1 ? (
            <button
              onClick={handlePrev}
              disabled={loading}
              className="px-5 py-3 rounded-xl border border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-slate-300 text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step === 4 ? (
            <button
              onClick={handleNext}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white font-semibold text-sm flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(139,92,246,0.25)] hover:scale-[1.02] disabled:opacity-50 disabled:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Launching...
                </>
              ) : (
                <>
                  Launch Dashboard <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={
                loading ||
                (step === 1 && !isVerticalValid) ||
                (step === 3 && crawlStarted !== 'done')
              }
              className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm flex items-center gap-2 transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:bg-violet-600/80"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  Continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
