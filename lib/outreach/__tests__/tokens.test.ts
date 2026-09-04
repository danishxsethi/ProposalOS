import { describe, expect, it } from 'vitest';
import { extractFirstName, renderTemplate, resolveTokens } from '../tokens';

describe('Personalization Token System', () => {
  it('extracts first name or doctor honorific cleanly', () => {
    expect(extractFirstName('Dr. Howard Green')).toBe('Dr. Howard');
    expect(extractFirstName('Dr. Green')).toBe('Dr. Green');
    expect(extractFirstName('Joe Pozzuoli')).toBe('Joe');
    expect(extractFirstName('Sarah')).toBe('Sarah');
    expect(extractFirstName(null)).toBe('');
    expect(extractFirstName('')).toBe('');
  });

  it('resolves tokens with complete audit data', () => {
    const tokens = resolveTokens({
      businessName: 'Park 56 Dental',
      decisionMakerName: 'Dr. Howard',
      city: 'New York',
      vertical: 'dental',
      topFindingTitle: 'Competitors have 342 more reviews',
      topFindingDollars: 3200,
      competitorName: 'Pearl Dental NYC',
    });

    expect(tokens.greeting).toBe('Hi Dr. Howard,');
    expect(tokens.businessName).toBe('Park 56 Dental');
    expect(tokens.city).toBe('New York');
    expect(tokens.topFindingDollars).toBe('$3,200/mo');
    expect(tokens.competitorName).toBe('Pearl Dental NYC');
  });

  it('fails closed and replaces missing tokens with grammatically sound fallbacks', () => {
    const tokens = resolveTokens({});

    expect(tokens.greeting).toBe('Hi,');
    expect(tokens.businessName).toBe('your team');
    expect(tokens.city).toBe('your area');
    expect(tokens.topFindingDollars).toBe('$1,800/mo');
    expect(tokens.competitorName).toBe('nearby competitors');
  });

  it('renders a full template with zero leftover tokens when given empty inputs', () => {
    const template = `{{greeting}} We analyzed {{businessName}} in {{city}} and found {{topFindingTitle}} costing ~{{topFindingDollars}}. {{competitorName}} is ahead.`;
    const rendered = renderTemplate(template, {});

    expect(rendered).not.toMatch(/{{\s*[\w\.]+\s*}}/);
    expect(rendered).toContain('Hi, We analyzed your team in your area');
    expect(rendered).not.toContain('Hi ,');
  });

  it('throws an error if an unknown token is passed to prevent silent leak', () => {
    const templateWithInvalidToken = `Hi {{firstName}}, check {{unknownProp}} out.`;
    expect(() => renderTemplate(templateWithInvalidToken, {})).toThrow(
      /Fail-Closed Token Error/
    );
  });
});
