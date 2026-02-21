/**
 * Unit tests for database schema and initialization
 */

import { initializePool, query, resetDatabase, closePool } from '../db/connection';

describe('Database Schema and Initialization', () => {
  beforeAll(async () => {
    initializePool();
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  describe('Locale Configurations', () => {
    it('should have all launch locales seeded', async () => {
      const result = await query('SELECT * FROM locale_configs ORDER BY locale');
      const locales = result.rows.map((row: any) => row.locale);

      expect(locales).toContain('en-US');
      expect(locales).toContain('en-GB');
      expect(locales).toContain('en-CA');
      expect(locales).toContain('en-AU');
      expect(locales).toContain('de-DE');
      expect(locales).toContain('fr-FR');
      expect(locales).toContain('es-ES');
      expect(locales).toHaveLength(7);
    });

    it('should have correct configuration for en-US', async () => {
      const result = await query('SELECT * FROM locale_configs WHERE locale = $1', ['en-US']);
      const config = result.rows[0];

      expect(config.language).toBe('English (US)');
      expect(config.primary_search_engine).toBe('google');
      expect(config.currency).toBe('USD');
      expect(config.tone).toBe('professional');
      expect(config.regulations).toContain('FTC');
    });

    it('should have correct configuration for de-DE', async () => {
      const result = await query('SELECT * FROM locale_configs WHERE locale = $1', ['de-DE']);
      const config = result.rows[0];

      expect(config.language).toBe('German');
      expect(config.primary_search_engine).toBe('google');
      expect(config.currency).toBe('EUR');
      expect(config.tone).toBe('formal');
      expect(config.regulations).toContain('GDPR');
    });

    it('should have correct configuration for fr-FR', async () => {
      const result = await query('SELECT * FROM locale_configs WHERE locale = $1', ['fr-FR']);
      const config = result.rows[0];

      expect(config.language).toBe('French');
      expect(config.currency).toBe('EUR');
      expect(config.tone).toBe('formal');
      expect(config.regulations).toContain('GDPR');
    });

    it('should have correct configuration for en-CA', async () => {
      const result = await query('SELECT * FROM locale_configs WHERE locale = $1', ['en-CA']);
      const config = result.rows[0];

      expect(config.language).toBe('English (Canada)');
      expect(config.currency).toBe('CAD');
      expect(config.regulations).toContain('PIPEDA');
    });

    it('should have correct configuration for en-AU', async () => {
      const result = await query('SELECT * FROM locale_configs WHERE locale = $1', ['en-AU']);
      const config = result.rows[0];

      expect(config.language).toBe('English (Australia)');
      expect(config.currency).toBe('AUD');
      expect(config.regulations).toContain('Privacy Act');
    });
  });

  describe('Table Creation', () => {
    it('should have localized_prompts table', async () => {
      const result = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'localized_prompts'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have anonymized_metrics table', async () => {
      const result = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'anonymized_metrics'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have benchmark_cohorts table', async () => {
      const result = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'benchmark_cohorts'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have patterns table', async () => {
      const result = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'patterns'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have recommendation_implementations table', async () => {
      const result = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'recommendation_implementations'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have effectiveness_records table', async () => {
      const result = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'effectiveness_records'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have intelligence_api_audit_log table', async () => {
      const result = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'intelligence_api_audit_log'
      `);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe('Indexes', () => {
    it('should have index on localized_prompts(node_id, locale)', async () => {
      const result = await query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'localized_prompts' 
        AND indexname = 'idx_localized_prompts_node_locale'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have index on anonymized_metrics(industry, business_size, locale)', async () => {
      const result = await query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'anonymized_metrics' 
        AND indexname = 'idx_anonymized_metrics_cohort'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('should have index on benchmark_cohorts lookup', async () => {
      const result = await query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'benchmark_cohorts' 
        AND indexname = 'idx_benchmark_cohorts_lookup'
      `);
      expect(result.rows).toHaveLength(1);
    });
  });
});
