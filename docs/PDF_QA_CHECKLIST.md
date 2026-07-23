# PDF Generation — QA Checklist

Use this checklist to verify the proposal PDF renders correctly before release.

## Pre-flight

- [ ] Chrome/Chromium available (`CHROME_EXECUTABLE_PATH` or system install)
- [ ] `BASE_URL` or `NEXT_PUBLIC_BASE_URL` set for PDF page fetch
- [ ] Proposal exists with audit + findings

## Page-by-Page Verification

### Cover Page

- [ ] Full bleed dark navy background (#1a1a2e)
- [ ] "Website Performance & Growth Audit" in white
- [ ] Business name in coral accent (#e94560)
- [ ] Date of audit correct
- [ ] 4 score circles (Performance, SEO, Accessibility, Security) show real data
- [ ] "Prepared by [Brand Name]" at bottom
- [ ] Logo displays if configured

### Executive Summary

- [ ] "Executive Summary" heading in navy
- [ ] 2–3 paragraphs of AI-generated content
- [ ] Right-aligned score callouts with color coding:
  - 90–100: Green
  - 70–89: Yellow
  - 50–69: Orange
  - 0–49: Red
- [ ] Key finding highlight box in coral with top painkiller

### Score Dashboard

- [ ] 4 SVG circular gauge charts render
- [ ] Each gauge shows score (0–100) in center
- [ ] Color coding matches score (green/yellow/orange/red)
- [ ] Industry benchmark tick visible on each gauge
- [ ] Labels: Performance, SEO, Accessibility, Security
- [ ] One-line summary below gauges (e.g. LCP timing)

### Competitor Comparison (if data exists)

- [ ] "Competitive Comparison" heading
- [ ] Horizontal bar chart with prospect + top 3 competitors
- [ ] Prospect row highlighted in coral
- [ ] Competitor rows in gray
- [ ] Metrics: Page Speed, Reviews, Rating
- [ ] Numbers align correctly on right

### Priority Action Matrix

- [ ] 2×2 grid with quadrants
- [ ] "Quick Wins" (top-left) highlighted with star
- [ ] Findings plotted as colored dots
- [ ] Quadrant labels: Quick Wins, Major Projects, Fill-ins, Time Sinks
- [ ] Axes labeled (Effort →, Impact ↑)

### Findings Pages

- [ ] Findings grouped by category (Speed, SEO, Reputation, etc.)
- [ ] Each finding card has:
  - Severity badge (CRITICAL/HIGH/MEDIUM/LOW) with color
  - Title in bold
  - Current state → Target (when available)
  - Recommended action
  - Evidence source citation
- [ ] No finding card split across pages

### Pricing Page

- [ ] 3 columns: Starter | Growth | Premium
- [ ] Growth column slightly taller/highlighted
- [ ] "RECOMMENDED" badge on Growth
- [ ] Correct prices: $497 / $1,497 / $2,997 (or tier config)
- [ ] Feature checkmarks for each tier
- [ ] "Let's Get Started" CTA area

### Next Steps Page

- [ ] 3 steps: Review → Pick plan → We handle the rest
- [ ] Contact information
- [ ] QR code placeholder
- [ ] Professional closing statement

### Footer (every page except cover)

- [ ] Left: "Confidential — Prepared for [Business Name]"
- [ ] Center: Page number (e.g. "Page 2 of 8")
- [ ] Right: "proposalengine.com"
- [ ] Footer does not overlap content

## Technical Checks

- [ ] Page numbers sequential and correct
- [ ] No content cut off at page boundaries
- [ ] File size reasonable (<5MB for typical audit)
- [ ] Renders correctly at A4 (210×297mm)
- [ ] Renders correctly at US Letter (215.9×279.4mm) if tested
- [ ] All SVGs render at high DPI (viewBox used)
- [ ] No hover effects or interactive elements in PDF
- [ ] Print background colors preserved (`printBackground: true`)

## How to Test

1. **Generate PDF**: `GET /api/proposal/[token]/pdf`
2. **Preview PDF page**: Navigate to `/proposal/[token]/pdf` in browser
3. **Print to PDF**: Use browser Print → Save as PDF to verify layout

## Common Issues

| Issue | Fix |
|-------|-----|
| Blank PDF | Check `data-pdf-ready` selector, increase wait time |
| Cut-off content | Add `page-break-inside: avoid` to cards |
| Wrong colors | Ensure `printBackground: true` in Puppeteer |
| Missing competitor chart | Competitor matrix only shows when finding has `evidence[].matrix` |
| Gauge not rendering | Verify SVG `viewBox` and `dangerouslySetInnerHTML` |
