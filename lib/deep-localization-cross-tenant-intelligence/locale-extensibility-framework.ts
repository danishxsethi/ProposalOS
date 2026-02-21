/**
 * Locale Extensibility Framework
 *
 * Provides a configuration-driven system for adding new locales to the platform.
 * Enforces validation, native speaker review requirements, and automatic benchmark
 * collection on locale deployment.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

// ============================================================================
// Types
// ============================================================================

export interface LocaleConfig {
  locale: string;
  language: string;
  primarySearchEngine: 'google' | 'yandex' | 'baidu' | 'naver';
  currency: string;
  regulations: string[];
  tone: 'formal' | 'casual' | 'professional';
  nativeSpeakerReviewRequired?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LocaleDeploymentResult {
  locale: string;
  status: 'deployed' | 'pending_review' | 'validation_failed';
  validationErrors?: string[];
  benchmarkCollectionStarted: boolean;
}

export interface DeploymentStatus {
  locale: string;
  deployedAt: Date;
  benchmarkCollectionStarted: boolean;
}

// ============================================================================
// LocaleExtensibilityFramework
// ============================================================================

export class LocaleExtensibilityFramework {
  private deployedLocales: Map<string, DeploymentStatus> = new Map();
  private benchmarkCollectionStarted: Set<string> = new Set();

  /**
   * Validates a locale configuration file.
   * Checks that all required fields are present and non-empty.
   * Requirement 13.1, 13.2
   */
  validateLocaleConfig(config: LocaleConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.locale || config.locale.trim() === '') {
      errors.push('locale is required and must be non-empty');
    }

    if (!config.language || config.language.trim() === '') {
      errors.push('language is required and must be non-empty');
    }

    const validSearchEngines = ['google', 'yandex', 'baidu', 'naver'];
    if (!config.primarySearchEngine || !validSearchEngines.includes(config.primarySearchEngine)) {
      errors.push(
        `primarySearchEngine is required and must be one of: ${validSearchEngines.join(', ')}`
      );
    }

    if (!config.currency || config.currency.trim() === '') {
      errors.push('currency is required and must be non-empty');
    }

    if (!config.regulations || !Array.isArray(config.regulations)) {
      errors.push('regulations is required and must be an array');
    }

    const validTones = ['formal', 'casual', 'professional'];
    if (!config.tone || !validTones.includes(config.tone)) {
      errors.push(`tone is required and must be one of: ${validTones.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Adds a new locale to the system.
   * Validates the config, enforces native speaker review, and deploys if valid.
   * Requirements: 13.1, 13.2, 13.3, 13.4
   */
  async addLocale(config: LocaleConfig): Promise<LocaleDeploymentResult> {
    // Validate the configuration (Req 13.1, 13.2)
    const validation = this.validateLocaleConfig(config);
    if (!validation.valid) {
      return {
        locale: config.locale ?? '',
        status: 'validation_failed',
        validationErrors: validation.errors,
        benchmarkCollectionStarted: false,
      };
    }

    // Enforce native speaker review requirement (Req 13.4)
    if (this.requiresNativeSpeakerReview(config.locale)) {
      const reviewProvided = config.nativeSpeakerReviewRequired === true;
      if (!reviewProvided) {
        return {
          locale: config.locale,
          status: 'pending_review',
          benchmarkCollectionStarted: false,
        };
      }
    }

    // Deploy the locale and start benchmark collection (Req 13.5)
    const deploymentStatus = await this.deployLocale(config.locale);

    return {
      locale: config.locale,
      status: 'deployed',
      benchmarkCollectionStarted: deploymentStatus.benchmarkCollectionStarted,
    };
  }

  /**
   * Deploys a locale: marks it as deployed and triggers benchmark collection.
   * Requirement 13.5
   */
  async deployLocale(locale: string): Promise<DeploymentStatus> {
    this.startBenchmarkCollection(locale);

    const status: DeploymentStatus = {
      locale,
      deployedAt: new Date(),
      benchmarkCollectionStarted: this.benchmarkCollectionStarted.has(locale),
    };

    this.deployedLocales.set(locale, status);
    return status;
  }

  /**
   * Returns the list of currently deployed locales.
   */
  getDeployedLocales(): string[] {
    return Array.from(this.deployedLocales.keys());
  }

  /**
   * All locales require native speaker review before deployment.
   * Requirement 13.4
   */
  requiresNativeSpeakerReview(_locale: string): boolean {
    return true;
  }

  /**
   * Records that benchmark collection has started for the given locale.
   * Requirement 13.5
   */
  startBenchmarkCollection(locale: string): void {
    this.benchmarkCollectionStarted.add(locale);
  }

  /**
   * Returns whether benchmark collection has started for a locale.
   */
  isBenchmarkCollectionStarted(locale: string): boolean {
    return this.benchmarkCollectionStarted.has(locale);
  }
}
