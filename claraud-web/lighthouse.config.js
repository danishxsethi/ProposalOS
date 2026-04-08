/**
 * Lighthouse CI Configuration
 *
 * Usage:
 * 1. npm run lighthouse:audit - Run audit on production URLs
 * 2. npm run lighthouse:local - Run audit on local dev server
 *
 * Requirements:
 * - npm install -g @lhci/cli
 */

module.exports = {
  ci: {
    collect: {
      // Number of times to run each URL
      numberOfRuns: 3,

      // URLs to audit (update for your environment)
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/pricing',
        'http://localhost:3000/scan',
        // Note: report/[token] and dashboard URLs require authentication/data
      ],

      // Use Puppeteer for collection
      puppeteerScript: './.lighthouse/puppeteer-script.js',

      // Chrome flags
      chromeFlags: '--no-sandbox --headless',

      // Skip SSL errors
      skipAutofail: true,
    },

    assert: {
      // Assertions for performance budgets
      assertions: {
        // Performance metrics
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],

        // Core Web Vitals
        'first-contentful-paint': ['warn', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        interactive: ['warn', { maxNumericValue: 3500 }],
        'speed-index': ['warn', { maxNumericValue: 3400 }],

        // Bundle size budgets
        'resource-summary:script:size': ['warn', { maxNumericValue: 250000 }],
        'resource-summary:stylesheet:size': ['warn', { maxNumericValue: 50000 }],
        'resource-summary:image:size': ['warn', { maxNumericValue: 500000 }],
        'resource-summary:font:size': ['warn', { maxNumericValue: 100000 }],

        // Third-party impact
        'third-party-summary': ['warn', { maxNumericValue: 500 }],
      },

      // What to do on assertion failure
      preset: 'lighthouse:no-preset',
    },

    upload: {
      // Upload results to Lighthouse CI server (optional)
      // target: 'filesystem',
      // outputDir: './.lighthouse/reports',
    },
  },
};
