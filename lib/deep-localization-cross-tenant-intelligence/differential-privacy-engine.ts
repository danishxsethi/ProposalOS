/**
 * DifferentialPrivacyEngine: Implements differential privacy via the Laplace mechanism.
 *
 * Differential privacy provides a mathematical guarantee that the output of a
 * computation does not reveal whether any individual record was included in the
 * input dataset. This is achieved by injecting calibrated random noise drawn
 * from a Laplace distribution.
 *
 * The Laplace mechanism adds noise ~ Laplace(0, sensitivity / epsilon) to each
 * numeric value, where:
 *   - sensitivity: the maximum change a single record can cause in the output
 *   - epsilon (ε): the privacy budget — smaller ε means stronger privacy but
 *     more noise (lower utility); larger ε means less noise but weaker privacy.
 *
 * Implements:
 * - applyDifferentialPrivacy()  - inject Laplace noise into metric values
 * - addNoise()                  - add noise to a single numeric value
 * - laplaceSample()             - sample from Laplace(0, scale) distribution
 * - configure()                 - update epsilon and sensitivity at runtime
 *
 * Requirements: 8.3, 12.2
 */

import { AnonymizedAuditMetrics } from './types';

// ============================================================================
// Configuration
// ============================================================================

export interface DifferentialPrivacyConfig {
  /**
   * Privacy budget (ε). Controls the privacy-utility tradeoff.
   *   - Smaller ε → stronger privacy, more noise, lower utility
   *   - Larger ε  → weaker privacy, less noise, higher utility
   * Typical values: 0.1 (strong privacy) to 10.0 (weak privacy).
   * Default: 1.0 (balanced tradeoff).
   */
  epsilon: number;

  /**
   * Global sensitivity (Δf). The maximum amount a single record can change
   * the output of the query function. For normalized metrics in [0, 100],
   * sensitivity = 1.0 is a reasonable default.
   * Default: 1.0
   */
  sensitivity: number;
}

const DEFAULT_CONFIG: DifferentialPrivacyConfig = {
  epsilon: 1.0,
  sensitivity: 1.0,
};

// ============================================================================
// DifferentialPrivacyEngine
// ============================================================================

export class DifferentialPrivacyEngine {
  private config: DifferentialPrivacyConfig;

  constructor(config: Partial<DifferentialPrivacyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validateConfig(this.config);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Apply differential privacy noise to all metric values in an
   * AnonymizedAuditMetrics record.
   *
   * Each metric value receives independent Laplace noise calibrated to the
   * configured epsilon and sensitivity. The `differentialPrivacyNoise` field
   * is updated to reflect the average absolute noise applied.
   *
   * Validates: Requirements 8.3, 12.2
   */
  applyDifferentialPrivacy(
    data: AnonymizedAuditMetrics,
    epsilon: number = this.config.epsilon,
    sensitivity: number = this.config.sensitivity,
  ): AnonymizedAuditMetrics {
    this.validateEpsilon(epsilon);
    this.validateSensitivity(sensitivity);

    const noisedMetrics = new Map<string, number>();
    let totalAbsoluteNoise = 0;

    for (const [key, value] of data.metrics.entries()) {
      const noise = this.laplaceSample(sensitivity / epsilon);
      noisedMetrics.set(key, value + noise);
      totalAbsoluteNoise += Math.abs(noise);
    }

    const avgNoise =
      data.metrics.size > 0 ? totalAbsoluteNoise / data.metrics.size : 0;

    return {
      ...data,
      metrics: noisedMetrics,
      differentialPrivacyNoise: avgNoise,
    };
  }

  /**
   * Add Laplace noise to a single numeric value.
   *
   * @param value      - The original numeric value
   * @param epsilon    - Privacy budget (overrides instance config if provided)
   * @param sensitivity - Global sensitivity (overrides instance config if provided)
   * @returns The value with Laplace noise added
   */
  addNoise(
    value: number,
    epsilon: number = this.config.epsilon,
    sensitivity: number = this.config.sensitivity,
  ): number {
    this.validateEpsilon(epsilon);
    this.validateSensitivity(sensitivity);
    return value + this.laplaceSample(sensitivity / epsilon);
  }

  /**
   * Sample a value from the Laplace distribution with mean 0 and the given scale.
   *
   * Uses the inverse CDF (quantile function) method:
   *   X = -scale * sign(U) * ln(1 - 2|U|)
   * where U ~ Uniform(-0.5, 0.5).
   *
   * This is numerically stable and avoids the degenerate case U = 0.
   *
   * @param scale - The scale parameter b of Laplace(0, b). Must be > 0.
   * @returns A sample from Laplace(0, scale)
   */
  laplaceSample(scale: number): number {
    if (scale <= 0) {
      throw new RangeError(`Laplace scale must be positive, got ${scale}`);
    }

    // Draw U from Uniform(-0.5, 0.5), excluding 0 to avoid log(1) = 0 edge case
    let u: number;
    do {
      u = Math.random() - 0.5;
    } while (u === 0);

    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Update the engine's epsilon and/or sensitivity configuration at runtime.
   */
  configure(config: Partial<DifferentialPrivacyConfig>): void {
    const updated = { ...this.config, ...config };
    this.validateConfig(updated);
    this.config = updated;
  }

  /**
   * Return the current configuration (read-only copy).
   */
  getConfig(): Readonly<DifferentialPrivacyConfig> {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private validateConfig(config: DifferentialPrivacyConfig): void {
    this.validateEpsilon(config.epsilon);
    this.validateSensitivity(config.sensitivity);
  }

  private validateEpsilon(epsilon: number): void {
    if (!isFinite(epsilon) || epsilon <= 0) {
      throw new RangeError(
        `Epsilon must be a positive finite number, got ${epsilon}. ` +
          'Typical values: 0.1 (strong privacy) to 10.0 (weak privacy).',
      );
    }
  }

  private validateSensitivity(sensitivity: number): void {
    if (!isFinite(sensitivity) || sensitivity <= 0) {
      throw new RangeError(
        `Sensitivity must be a positive finite number, got ${sensitivity}.`,
      );
    }
  }
}
