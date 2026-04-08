# Cross-Browser PDF Testing Guide

## Overview

This document outlines the testing procedure for ensuring PDF proposals render identically across Chrome, Safari, and Firefox.

## Test Environment

### Required Browsers

- **Chrome** (latest) - Chromium-based reference
- **Safari** (latest) - WebKit-based (macOS/iOS)
- **Firefox** (latest) - Gecko-based

### Test Pages

- `/proposal/[token]` - Public proposal view
- `/proposal/[token]/pdf` - PDF export endpoint
- `/presentation/[token]` - Presentation view

## Testing Procedure

### 1. Visual Regression Testing

For each browser, verify the following:

#### Layout Consistency

- [ ] Page margins are consistent (±1px tolerance)
- [ ] Text wrapping occurs at same points
- [ ] Images scale proportionally
- [ ] Tables maintain column widths
- [ ] Page breaks occur at logical points

#### Typography

- [ ] Font families render correctly
- [ ] Font sizes are consistent (±0.5pt tolerance)
- [ ] Line heights are consistent
- [ ] Letter spacing is consistent

#### Colors

- [ ] Brand colors match hex values
- [ ] Gradients render correctly
- [ ] Transparency/opacity is consistent
- [ ] Print media styles apply correctly

#### Interactive Elements

- [ ] Buttons are clickable
- [ ] Links navigate correctly
- [ ] Form fields are accessible (if applicable)

### 2. Automated Testing Script

```bash
# Run PDF export in all browsers
npm run test:pdf:chrome
npm run test:pdf:firefox
npm run test:pdf:safari

# Compare screenshots
npm run test:pdf:compare
```

### 3. Manual Testing Checklist

| Browser | Version | Layout | Fonts | Colors | Images | Links | Status |
| ------- | ------- | ------ | ----- | ------ | ------ | ----- | ------ |
| Chrome  |         | ☐      | ☐     | ☐      | ☐      | ☐     |        |
| Safari  |         | ☐      | ☐     | ☐      | ☐      | ☐     |        |
| Firefox |         | ☐      | ☐     | ☐      | ☐      | ☐     |        |

### 4. Known Issues

| Issue | Browser | Workaround | Status |
| ----- | ------- | ---------- | ------ |
|       |         |            |        |

## PDF Generation Options

### Option 1: html2pdf (Client-side)

```typescript
import html2pdf from 'html2pdf.js';

const generatePdf = async (element: HTMLElement) => {
  const opt = {
    margin: 0.5,
    filename: 'proposal.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
  };

  await html2pdf().set(opt).from(element).save();
};
```

**Pros:** Client-side, no server required
**Cons:** Larger file size, potential rendering differences

### Option 2: Puppeteer (Server-side)

```typescript
import puppeteer from 'puppeteer';

const generatePdf = async (url: string) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', bottom: '20px' },
  });
  await browser.close();
  return pdf;
};
```

**Pros:** Consistent rendering, smaller file size
**Cons:** Server resource intensive

### Option 3: Playwright (Cross-browser)

```typescript
import { chromium, webkit, firefox } from '@playwright/test';

const generatePdf = async (url: string, browserType: string = 'chromium') => {
  const browser = await { chromium, webkit, firefox }[browserType].launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
  });
  await browser.close();
  return pdf;
};
```

**Pros:** True cross-browser testing
**Cons:** More complex setup

## Recommendations

1. **Use Puppeteer for production PDF generation** - Most consistent results
2. **Run cross-browser tests on every PR** - Catch regressions early
3. **Maintain visual baseline screenshots** - Track changes over time
4. **Test on actual devices** - iOS Safari may differ from desktop

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/pdf-testing.yml
name: PDF Cross-Browser Testing

on: [push, pull_request]

jobs:
  test-pdf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install
      - name: Run PDF tests
        run: npm run test:pdf
```

## Resources

- [Puppeteer PDF Documentation](https://pptr.dev/api/puppeteer.page.pdf)
- [Playwright PDF Documentation](https://playwright.dev/docs/api/class-page#page-pdf)
- [html2pdf Documentation](https://github.com/eKoopmans/html2pdf.js)
