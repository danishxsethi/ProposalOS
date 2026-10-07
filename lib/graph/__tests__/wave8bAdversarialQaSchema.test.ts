import { describe, expect, it } from 'vitest';

import {
  parseCompetitorFlags,
  parseConsistencyFlags,
  parseHallucinationFlags,
} from '../adversarial-qa-graph';

describe('Wave 8B adversarial QA schemas', () => {
  it('accepts strict bounded outputs and markdown-fence cleanup', () => {
    expect(
      parseHallucinationFlags(
        '```json\n[{"claim":"Claim","location":"Summary","reason":"No citation"}]\n```'
      )
    ).toHaveLength(1);
    expect(
      parseConsistencyFlags(
        '[{"type":"metric","conflictingElements":["10","12"],"suggestion":"Review"}]'
      )
    ).toHaveLength(1);
    expect(
      parseCompetitorFlags('[{"claim":"Rival leads","issue":"No evidence","suggestion":"Remove"}]')
    ).toHaveLength(1);
  });

  it.each([
    ['not json', parseHallucinationFlags],
    ['[{"claim":"x","location":"y","reason":"z","approved":true}]', parseHallucinationFlags],
    [
      '[{"type":"x","conflictingElements":[],"suggestion":"y","auditId":"other"}]',
      parseConsistencyFlags,
    ],
    ['[{"claim":"x","issue":"y","suggestion":"z","tenantId":"other"}]', parseCompetitorFlags],
  ])('rejects malformed or identity-bearing output', (text, parse) => {
    expect(() => parse(text)).toThrow();
  });
});
