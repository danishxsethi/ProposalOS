import { AccessibilityGenerator } from './accessibilityGenerator';
import { ContentGenerator } from './contentGenerator';
import { GBPGenerator } from './gbpGenerator';
import { MetaTagGenerator } from './metaTagGenerator';
import { ArtifactGenerator, SchemaGenerator } from './schemaGenerator';
import { SpeedGenerator } from './speedGenerator';

export type { RawArtifact, ArtifactGenerator } from './schemaGenerator';
export {
  SchemaGenerator,
  MetaTagGenerator,
  SpeedGenerator,
  GBPGenerator,
  ContentGenerator,
  AccessibilityGenerator,
};

/**
 * Registry mapping finding categories to their corresponding generators
 */
export const generatorRegistry: Record<string, ArtifactGenerator> = {
  SCHEMA: new SchemaGenerator(),
  SEO: new MetaTagGenerator(),
  SPEED: new SpeedGenerator(),
  PERFORMANCE: new SpeedGenerator(),
  GBP: new GBPGenerator(),
  CONTENT: new ContentGenerator(),
  ACCESSIBILITY: new AccessibilityGenerator(),
};

/**
 * Get a generator for a specific finding category
 */
export function getGenerator(category: string): ArtifactGenerator | undefined {
  return generatorRegistry[category];
}

/**
 * Get all supported categories
 */
export function getSupportedCategories(): string[] {
  return Object.keys(generatorRegistry);
}
