/**
 * SVG chart generators for PDF — pure SVG, no external libs.
 * Puppeteer renders SVG natively. Use viewBox for high-DPI scaling.
 * Design: navy #1a1a2e + accent blue #4361ee
 */

const COLORS = {
    accent: '#4361ee',
    prospect: '#4361ee',
    competitor: '#9ca3af',
    scoreGreen: '#22c55e',
    scoreYellow: '#f59e0b',
    scoreRed: '#ef4444',
    gray: '#9ca3af',
    grayLight: '#e5e7eb',
    navy: '#1a1a2e',
    doFirst: '#22c55e',
    planFor: '#4361ee',
    quickWins: '#f59e0b',
    deprioritize: '#9ca3af',
};

/** 0-40 = red, 41-70 = yellow, 71-100 = green */
function getScoreColor(score: number): string {
    if (score >= 71) return COLORS.scoreGreen;
    if (score >= 41) return COLORS.scoreYellow;
    return COLORS.scoreRed;
}

/**
 * Generate SVG circular gauge chart for score dashboard.
 * @param score 0-100
 * @param label e.g. "Performance"
 * @param benchmark Industry average 0-100 (shown as tick mark)
 */
export function generateScoreGaugeSVG(
    score: number,
    label: string,
    _benchmark?: number
): string {
    const size = 100;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const color = getScoreColor(score);

    const circumference = 2 * Math.PI * radius;
    const filled = Math.min((score / 100) * circumference, circumference);

    return `
<svg viewBox="0 0 ${size} 130" xmlns="http://www.w3.org/2000/svg" class="pdf-chart-svg">
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${COLORS.grayLight}" stroke-width="${strokeWidth}" />
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
    stroke-dasharray="${filled} ${circumference}" stroke-linecap="round"
    transform="rotate(-90 ${cx} ${cy})" />
  <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="24" font-weight="700" fill="${color}">${score}</text>
  <text x="${cx}" y="${size + 20}" text-anchor="middle" font-size="10" font-weight="600" fill="#1a1a2e">${label}</text>
</svg>`;
}

export interface BusinessData {
    name: string;
    overallScore?: number;
    pageSpeed?: number;
    mobileScore?: number;
    seoScore?: number;
    accessibilityScore?: number;
    securityScore?: number;
    reviewCount?: number;
    rating?: number;
}

export interface CompetitorData {
    name: string;
    overallScore?: number;
    pageSpeed?: number;
    mobileScore?: number;
    seoScore?: number;
    accessibilityScore?: number;
    securityScore?: number;
    reviewCount?: number;
    rating?: number;
}

/** Default metrics: Overall Score, Mobile Speed, SEO Score, Accessibility */
const DEFAULT_COMPARISON_METRICS: Array<{ key: keyof BusinessData; label: string; max?: number }> = [
    { key: 'overallScore', label: 'Overall Score', max: 100 },
    { key: 'mobileScore', label: 'Mobile Speed', max: 100 },
    { key: 'seoScore', label: 'SEO Score', max: 100 },
    { key: 'accessibilityScore', label: 'Accessibility', max: 100 },
];

/**
 * Generate horizontal bar chart comparing prospect vs top 2-3 competitors.
 * Prospect bars in accent blue, competitors in gray. Includes legend.
 */
export function generateComparisonChartSVG(
    prospect: BusinessData,
    competitors: CompetitorData[],
    metrics: Array<{ key: keyof BusinessData; label: string; max?: number }> = DEFAULT_COMPARISON_METRICS
): string {
    const rowHeight = 28;
    const labelWidth = 130;
    const chartWidth = 180;
    const numWidth = 36;
    const headerHeight = 24;
    const metricGap = 12;
    const totalMetrics = metrics.length;
    const rows = [prospect, ...competitors.slice(0, 3)];
    const height = headerHeight + rows.length * (rowHeight + 4) * totalMetrics + 20;

    let y = headerHeight;
    const totalWidth = labelWidth + chartWidth + numWidth + 20;
    let svg = `<svg viewBox="0 0 ${totalWidth} ${height}" xmlns="http://www.w3.org/2000/svg" class="pdf-chart-svg">
  <text x="0" y="16" font-size="12" font-weight="700" fill="#16213e">Competitive Comparison</text>
  <text x="0" y="36" font-size="9" fill="#6c757d">You vs. top local competitors</text>`;

    y = 55;

    for (const metric of metrics) {
        const maxVal = metric.max ?? Math.max(
            (prospect[metric.key] as number) ?? 0,
            ...competitors.map(c => (c[metric.key] as number) ?? 0),
            100
        ) * 1.2;

        svg += `<text x="0" y="${y + 14}" font-size="10" font-weight="600" fill="#16213e">${metric.label}</text>`;
        y += 18;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const val = (row[metric.key] as number) ?? 0;
            const barWidth = maxVal > 0 ? (val / maxVal) * chartWidth : 0;
            const isProspect = i === 0;
            const fill = isProspect ? COLORS.prospect : COLORS.competitor;
            const name = row.name + (isProspect ? ' (You)' : '');

            svg += `
  <text x="0" y="${y + 12}" font-size="9" fill="#1a1a2e">${name.length > 18 ? name.slice(0, 16) + '…' : name}</text>
  <rect x="${labelWidth}" y="${y - 8}" width="${chartWidth}" height="16" rx="2" fill="${COLORS.grayLight}" />
  <rect x="${labelWidth}" y="${y - 8}" width="${Math.max(barWidth, 0)}" height="16" rx="2" fill="${fill}" />
  <text x="${labelWidth + chartWidth + 8}" y="${y + 4}" font-size="9" font-weight="600" fill="#1a1a2e">${val}</text>`;
            y += rowHeight;
        }
        y += metricGap;
    }

    // Legend
    const legendY = y + 16;
    svg += `
  <rect x="0" y="${legendY - 4}" width="10" height="10" rx="2" fill="${COLORS.prospect}" />
  <text x="14" y="${legendY + 4}" font-size="9" fill="#1a1a2e">You (Prospect)</text>
  <rect x="100" y="${legendY - 4}" width="10" height="10" rx="2" fill="${COLORS.competitor}" />
  <text x="114" y="${legendY + 4}" font-size="9" fill="#1a1a2e">Competitors</text>`;

    svg += '</svg>';
    return svg;
}

export interface FindingForMatrix {
    id: string;
    title: string;
    impactScore: number;
    effortEstimate?: string | null;
}

/**
 * Map effort string to 0-1 (Low=0, High=1)
 */
function effortToX(effort: string | undefined | null): number {
    switch ((effort || 'MEDIUM').toUpperCase()) {
        case 'LOW': return 0.15;
        case 'MEDIUM': return 0.5;
        case 'HIGH': return 0.85;
        default: return 0.5;
    }
}

/**
 * Map impact 1-10 to y position (10=top/high, 1=bottom/low)
 * Used as: y = padding + plotSize - impactToY*plotSize. High impact -> large impactToY -> small y (top)
 */
function impactToY(impact: number): number {
    return (impact / 10) * 0.9;
}

/**
 * Generate 2x2 Priority Action Matrix (Impact vs Effort).
 * Quadrants: DO FIRST (top-left, green), PLAN FOR (top-right, blue), QUICK WINS (bottom-left, yellow), DEPRIORITIZE (bottom-right, gray)
 */
export function generatePriorityMatrixSVG(findings: FindingForMatrix[]): string {
    const size = 340;
    const padding = 55;
    const plotSize = size - padding * 2;

    const getQuadrantColor = (impact: number, effort: string | undefined | null) => {
        const isHighImpact = impact >= 6;
        const isLowEffort = (effort || 'MEDIUM').toUpperCase() === 'LOW';
        if (isHighImpact && isLowEffort) return COLORS.doFirst;
        if (isHighImpact && !isLowEffort) return COLORS.planFor;
        if (!isHighImpact && isLowEffort) return COLORS.quickWins;
        return COLORS.deprioritize;
    };

    let svg = `<svg viewBox="0 0 ${size} ${size + 70}" xmlns="http://www.w3.org/2000/svg" class="pdf-chart-svg">
  <text x="${size / 2}" y="20" text-anchor="middle" font-size="14" font-weight="700" fill="${COLORS.navy}">Priority Action Matrix</text>
  <text x="${size / 2}" y="38" text-anchor="middle" font-size="9" fill="#6c757d">Impact vs. Effort — focus on DO FIRST</text>
  <!-- Grid with quadrant backgrounds -->
  <rect x="${padding}" y="${padding}" width="${plotSize / 2}" height="${plotSize / 2}" fill="rgba(34,197,94,0.08)" stroke="#e5e7eb" stroke-width="1" />
  <rect x="${padding + plotSize / 2}" y="${padding}" width="${plotSize / 2}" height="${plotSize / 2}" fill="rgba(67,97,238,0.08)" stroke="#e5e7eb" stroke-width="1" />
  <rect x="${padding}" y="${padding + plotSize / 2}" width="${plotSize / 2}" height="${plotSize / 2}" fill="rgba(245,158,11,0.08)" stroke="#e5e7eb" stroke-width="1" />
  <rect x="${padding + plotSize / 2}" y="${padding + plotSize / 2}" width="${plotSize / 2}" height="${plotSize / 2}" fill="rgba(156,163,175,0.08)" stroke="#e5e7eb" stroke-width="1" />
  <!-- Quadrant labels -->
  <text x="${padding + plotSize / 4}" y="${padding + plotSize / 4 - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="${COLORS.doFirst}">DO FIRST</text>
  <text x="${padding + plotSize / 4}" y="${padding + plotSize / 4 + 2}" text-anchor="middle" font-size="8" fill="#6c757d">High Impact, Easy Fix</text>
  <text x="${padding + (3 * plotSize) / 4}" y="${padding + plotSize / 4 - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="${COLORS.planFor}">PLAN FOR</text>
  <text x="${padding + (3 * plotSize) / 4}" y="${padding + plotSize / 4 + 2}" text-anchor="middle" font-size="8" fill="#6c757d">High Impact, Hard Fix</text>
  <text x="${padding + plotSize / 4}" y="${padding + (3 * plotSize) / 4 - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="${COLORS.quickWins}">QUICK WINS</text>
  <text x="${padding + plotSize / 4}" y="${padding + (3 * plotSize) / 4 + 2}" text-anchor="middle" font-size="8" fill="#6c757d">Low Impact, Easy Fix</text>
  <text x="${padding + (3 * plotSize) / 4}" y="${padding + (3 * plotSize) / 4 - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="${COLORS.deprioritize}">DEPRIORITIZE</text>
  <text x="${padding + (3 * plotSize) / 4}" y="${padding + (3 * plotSize) / 4 + 2}" text-anchor="middle" font-size="8" fill="#6c757d">Low Impact, Hard Fix</text>
  <!-- Axes -->
  <text x="${padding + plotSize / 2}" y="${size - 8}" text-anchor="middle" font-size="9" fill="#6c757d">Effort →</text>
  <text x="14" y="${padding + plotSize / 2}" text-anchor="middle" font-size="9" fill="#6c757d" transform="rotate(-90 14 ${padding + plotSize / 2})">Impact ↑</text>`;

    for (const f of findings.slice(0, 12)) {
        const x = padding + effortToX(f.effortEstimate) * plotSize;
        const y = padding + plotSize - impactToY(f.impactScore) * plotSize;
        const color = getQuadrantColor(f.impactScore, f.effortEstimate);
        svg += `\n  <circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#fff" stroke-width="1.5" />`;
    }

    svg += `
</svg>`;
    return svg;
}
