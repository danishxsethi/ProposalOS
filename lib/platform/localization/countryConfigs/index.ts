import { CountryConfig, SupportedCountry } from '../localizationEngine';
import { usConfig } from './us';
import { ukConfig } from './uk';
import { caConfig } from './ca';
import { auConfig } from './au';
import { esConfig } from './es';
import { brConfig } from './br';

export { usConfig } from './us';
export { ukConfig } from './uk';
export { caConfig } from './ca';
export { auConfig } from './au';
export { esConfig } from './es';
export { brConfig } from './br';

export const COUNTRY_CONFIGS: Record<SupportedCountry, CountryConfig> = {
  us: usConfig,
  uk: ukConfig,
  ca: caConfig,
  au: auConfig,
  es: esConfig,
  br: brConfig,
};
