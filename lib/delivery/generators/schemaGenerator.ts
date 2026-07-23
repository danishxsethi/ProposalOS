import { Finding } from '@prisma/client';

export interface RawArtifact {
  content: string;
  artifactType: string;
  metadata: {
    findingId: string;
    generatedAt: Date;
    category: string;
  };
}

export interface ArtifactGenerator {
  generate(finding: Finding, proposalContext: Record<string, any>): Promise<RawArtifact>;
  getArtifactType(): string;
  supportsWordPress(): boolean;
  generateWordPressPlugin?(finding: Finding, artifact: RawArtifact): Promise<string>;
}

/**
 * Schema Generator - Generates JSON-LD snippets for LocalBusiness, FAQPage, Review schema types
 */
export class SchemaGenerator implements ArtifactGenerator {
  async generate(finding: Finding, proposalContext: Record<string, any>): Promise<RawArtifact> {
    const schemaType = this.determineSchemaType(finding, proposalContext);
    const content = this.generateJsonLd(schemaType, finding, proposalContext);

    return {
      content,
      artifactType: 'json_ld',
      metadata: {
        findingId: finding.id,
        generatedAt: new Date(),
        category: finding.category,
      },
    };
  }

  getArtifactType(): string {
    return 'json_ld';
  }

  supportsWordPress(): boolean {
    return true;
  }

  async generateWordPressPlugin(finding: Finding, artifact: RawArtifact): Promise<string> {
    const jsonLd = artifact.content;
    const escapedJson = jsonLd.replace(/'/g, "\\'").replace(/"/g, '\\"');

    return `<?php
/**
 * Plugin Name: Schema Markup - ${finding.title}
 * Description: Auto-generated schema markup for ${finding.title}
 * Version: 1.0.0
 */

add_action('wp_head', function() {
    echo '<script type="application/ld+json">
' . json_encode(json_decode('${escapedJson}'), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . '
    </script>';
});
?>`;
  }

  private determineSchemaType(finding: Finding, context: Record<string, any>): string {
    const description = (finding.description || '').toLowerCase();

    if (description.includes('faq') || description.includes('question')) {
      return 'FAQPage';
    }
    if (description.includes('review') || description.includes('rating')) {
      return 'Review';
    }
    return 'LocalBusiness';
  }

  private generateJsonLd(schemaType: string, finding: Finding, context: Record<string, any>): string {
    const businessName = context.businessName || 'Your Business';
    const businessUrl = context.businessUrl || 'https://example.com';

    let schema: any = {
      '@context': 'https://schema.org',
      '@type': schemaType,
    };

    if (schemaType === 'LocalBusiness') {
      schema = {
        ...schema,
        name: businessName,
        url: businessUrl,
        description: finding.description || `${finding.title} - ${businessName}`,
        image: context.logoUrl || `${businessUrl}/logo.png`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: context.businessAddress || '',
          addressLocality: context.businessCity || '',
          postalCode: context.businessZip || '',
          addressCountry: 'US',
        },
        telephone: context.businessPhone || '',
      };
    } else if (schemaType === 'FAQPage') {
      schema = {
        ...schema,
        mainEntity: [
          {
            '@type': 'Question',
            name: finding.title,
            acceptedAnswer: {
              '@type': 'Answer',
              text: finding.description || `Answer to: ${finding.title}`,
            },
          },
        ],
      };
    } else if (schemaType === 'Review') {
      schema = {
        ...schema,
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: context.rating || '5',
          bestRating: '5',
          worstRating: '1',
        },
        reviewBody: finding.description || `Review: ${finding.title}`,
        author: {
          '@type': 'Person',
          name: context.reviewerName || 'Customer',
        },
      };
    }

    return JSON.stringify(schema, null, 2);
  }
}
