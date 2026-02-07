'use client';

interface TierConfig {
    name: string;
    description: string;
    deliveryTime: string;
    price?: number;
    findingIds: string[];
}

interface TierCardProps {
    tier: TierConfig;
    variant: 'essentials' | 'growth' | 'premium';
    isPopular?: boolean;
}

export default function TierCard({ tier, variant, isPopular }: TierCardProps) {
    const variantClass = {
        essentials: 'tier-essentials',
        growth: 'tier-growth',
        premium: 'tier-premium',
    }[variant];

    const variantColor = {
        essentials: 'var(--tier-essentials)',
        growth: 'var(--tier-growth)',
        premium: 'var(--tier-premium)',
    }[variant];

    return (
        <div className={`tier-card ${variantClass} relative`}>
            {isPopular && (
                <div
                    className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: variantColor, color: 'black' }}
                >
                    MOST POPULAR
                </div>
            )}

            <div className="text-center mb-6">
                <h3 className="text-xl font-semibold mb-1" style={{ color: variantColor }}>
                    {tier.name}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)]">{tier.description}</p>
            </div>

            <div className="text-center mb-6">
                <span className="text-4xl font-bold text-[var(--color-text-primary)]">
                    ${tier.price?.toLocaleString()}
                </span>
                <span className="text-[var(--color-text-muted)] ml-1">one-time</span>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {tier.deliveryTime}
                </p>
            </div>

            <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <svg
                        className="w-5 h-5"
                        style={{ color: variantColor }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                    <span>{tier.findingIds.length} issues addressed</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <svg
                        className="w-5 h-5"
                        style={{ color: variantColor }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                    <span>Full implementation</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <svg
                        className="w-5 h-5"
                        style={{ color: variantColor }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                    <span>Delivery in {tier.deliveryTime}</span>
                </div>
            </div>

            <button
                className="btn w-full py-3"
                style={{
                    background: `linear-gradient(135deg, ${variantColor}, ${variantColor}88)`,
                    color: variant === 'premium' ? 'black' : 'white',
                }}
            >
                Choose {tier.name}
            </button>
        </div>
    );
}
