import { describe, expect, it } from 'vitest';

import {
  getValidationRetryRoute,
  isPainkillerSeverity,
  MAX_VALIDATION_RETRIES,
} from './diagnosis-helpers';

describe('diagnosis-graph routing and severity helpers', () => {
  it('routes to degrade_and_continue after validation retries are exhausted', () => {
    expect(getValidationRetryRoute(MAX_VALIDATION_RETRIES)).toBe('cluster_root_causes');
    expect(getValidationRetryRoute(MAX_VALIDATION_RETRIES + 1)).toBe('degrade_and_continue');
  });

  it('classifies critical and high severities as painkillers', () => {
    expect(isPainkillerSeverity('critical')).toBe(true);
    expect(isPainkillerSeverity('high')).toBe(true);
    expect(isPainkillerSeverity('medium')).toBe(false);
    expect(isPainkillerSeverity('low')).toBe(false);
  });
});
