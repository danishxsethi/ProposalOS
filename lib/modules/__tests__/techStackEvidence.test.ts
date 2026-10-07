/**
 * Wave 3 (P1-26) regression fixture: techStack previously built findings with
 * `evidence: []` ("No Analytics Tools Detected", "No Email Marketing Integration") and
 * hand-built evidence literals missing pointer/collected_at ("Website Built on X",
 * "Modern Technology Stack", "Comprehensive Digital Tooling"). Every finding must now
 * carry real, contract-valid evidence identifying the analyzed URL.
 */
import { describe, expect, it } from 'vitest';

import { validateFinding } from '@/lib/audit/findingContract';

import { generateTechFindings, type TechStack } from '../techStack';

const URL = 'https://acme-dental.com/';
const COLLECTED_AT = new Date().toISOString();

const emptyStack: TechStack = {
  cms: [],
  hosting: [],
  analytics: [],
  marketing: [],
  widgets: [],
  frameworks: [],
};

describe('generateTechFindings (P1-26 regression)', () => {
  it('"No Analytics Tools Detected" carries real, non-empty, contract-valid evidence', () => {
    const findings = generateTechFindings(emptyStack, URL, COLLECTED_AT);
    const finding = findings.find((f) => f.title === 'No Analytics Tools Detected');
    expect(finding).toBeDefined();
    expect(finding!.evidence.length).toBeGreaterThan(0);
    expect(validateFinding({ ...finding, module: 'techStack' }).success).toBe(true);
    expect((finding!.evidence[0] as { pointer: string }).pointer).toBe(URL);
  });

  it('"No Email Marketing Integration" carries real evidence', () => {
    const findings = generateTechFindings(emptyStack, URL, COLLECTED_AT);
    const finding = findings.find((f) => f.title === 'No Email Marketing Integration');
    expect(finding).toBeDefined();
    expect(finding!.evidence.length).toBeGreaterThan(0);
    expect(validateFinding({ ...finding, module: 'techStack' }).success).toBe(true);
  });

  it('"Website Built on X" evidence has a real pointer, not a bare hand-built literal', () => {
    const stack: TechStack = { ...emptyStack, cms: ['Wix'] };
    const findings = generateTechFindings(stack, URL, COLLECTED_AT);
    const finding = findings.find((f) => f.title.includes('Wix'));
    expect(finding).toBeDefined();
    expect(validateFinding({ ...finding, module: 'techStack' }).success).toBe(true);
  });

  it('"Modern Technology Stack" (triggered by hosting alone) still has non-empty evidence', () => {
    const stack: TechStack = { ...emptyStack, hosting: ['Vercel'] };
    const findings = generateTechFindings(stack, URL, COLLECTED_AT);
    const finding = findings.find((f) => f.title === 'Modern Technology Stack');
    expect(finding).toBeDefined();
    expect(finding!.evidence.length).toBeGreaterThan(0);
    expect(validateFinding({ ...finding, module: 'techStack' }).success).toBe(true);
  });

  it('"Comprehensive Digital Tooling" evidence items all carry real pointers', () => {
    const stack: TechStack = {
      ...emptyStack,
      analytics: ['Google Analytics'],
      marketing: ['Mailchimp'],
      widgets: ['Intercom'],
    };
    const findings = generateTechFindings(stack, URL, COLLECTED_AT);
    const finding = findings.find((f) => f.title === 'Comprehensive Digital Tooling');
    expect(finding).toBeDefined();
    expect(validateFinding({ ...finding, module: 'techStack' }).success).toBe(true);
  });

  it('every finding produced, across a mixed stack, passes the runtime Finding contract', () => {
    const stack: TechStack = {
      cms: ['Squarespace'],
      hosting: ['Netlify'],
      analytics: [],
      marketing: [],
      widgets: ['Calendly'],
      frameworks: [],
    };
    const findings = generateTechFindings(stack, URL, COLLECTED_AT);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      const result = validateFinding({ ...f, module: 'techStack' });
      expect(result.success).toBe(true);
    }
  });
});
