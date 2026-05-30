-- Seed initial locale configurations for launch locales

INSERT INTO locale_configs (locale, language, primary_search_engine, currency, regulations, tone)
VALUES
  ('en-US', 'English (US)', 'google', 'USD', '["FTC"]'::jsonb, 'professional'),
  ('en-GB', 'English (UK)', 'google', 'GBP', '["GDPR", "ICO"]'::jsonb, 'professional'),
  ('en-CA', 'English (Canada)', 'google', 'CAD', '["PIPEDA"]'::jsonb, 'professional'),
  ('en-AU', 'English (Australia)', 'google', 'AUD', '["Privacy Act"]'::jsonb, 'professional'),
  ('de-DE', 'German', 'google', 'EUR', '["GDPR", "TMG"]'::jsonb, 'formal'),
  ('fr-FR', 'French', 'google', 'EUR', '["GDPR", "CNIL"]'::jsonb, 'formal'),
  ('es-ES', 'Spanish', 'google', 'EUR', '["GDPR", "AEPD"]'::jsonb, 'formal')
ON CONFLICT (locale) DO NOTHING;
