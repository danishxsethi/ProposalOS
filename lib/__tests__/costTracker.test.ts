
import { describe, it, expect } from 'vitest';
import { CostTracker } from '../costs/costTracker';

describe('Cost Tracker', () => {
    it('should initialize with zero cost', () => {
        const tracker = new CostTracker();
        expect(tracker.getTotalCents()).toBe(0);
    });

    it('should accumulate API costs', () => {
        const tracker = new CostTracker();
        tracker.addApiCall('PLACES_TEXT_SEARCH', 1); // 3 cents
        tracker.addApiCall('SERP_API', 1);    // 1 cent
        // 3 + 1 = 4
        expect(tracker.getTotalCents()).toBe(4);
    });

    it('should accumulate AI token costs', () => {
        const tracker = new CostTracker();
        // 1000 input tokens at $0.01/1k = 0.01 cents
        // 1000 output tokens at $0.03/1k = 0.03 cents
        // total = 0.04 cents
        tracker.addLlmCall('GEMINI_FLASH', 1000, 1000);

        const report = tracker.getReport();
        expect(report.totalCents).toBe(1); // Math.ceil(0.04) = 1
    });
});
