import { Finding } from '@prisma/client';
import { RawArtifact, ArtifactGenerator } from './schemaGenerator';

/**
 * Meta Tag Generator - Generates HTML <meta> blocks for title, description, and OG tags
 */
export class MetaTagGenerator implements ArtifactGenerator {
  async generate(finding: Finding, proposalContext: Record<string, any>): Promise<RawArtifact> {
    const content = this.generateMetaTags(finding, proposalContext);

    return {
      content,
      artifactType: 'html_meta',
      metadata: {
        findingId: finding.id,
        generatedAt: new Date(),
        category: finding.category,
      },
    };
  }

  getArtifactType(): string {
    return 'html_meta';
  }

  supportsWordPress(): boolean {
    return true;
  }

  async generateWordPressPlugin(finding: Finding, artifact: RawArtifact): Promise<string> {
    return `<?php
/**
 * Plugin Name: Meta Tags - ${finding.title}
 * Description: Auto-generated meta tags for ${finding.title}
 * Version: 1.0.0
 */

add_action('wp_head', function() {
    echo '<!-- Auto-generated meta tags -->';
    echo '${artifact.content.replace(/'/g, "\\'").replace(/"/g, '\\"')}';
});
?>`;
  }

  private generateMetaTags(finding: Finding, context: Record<string, any>): string {
    const title = context.pageTitle || finding.title;
    const description = finding.description || `${finding.title} - Optimized for search engines`;
    const url = context.pageUrl || context.businessUrl || 'https://example.com';
    const image = context.ogImage || context.logoUrl || `${url}/og-image.png`;

    const metaTags = [
      `<meta charset="UTF-8">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
      `<meta name="description" content="${this.escapeHtml(description)}">`,
      `<meta name="keywords" content="${this.generateKeywords(finding)}">`,
      `<meta name="author" content="${context.businessName || 'Your Business'}">`,
      ``,
      `<!-- Open Graph Tags -->`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${this.escapeHtml(title)}">`,
      `<meta property="og:description" content="${this.escapeHtml(description)}">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:image" content="${image}">`,
      `<meta property="og:site_name" content="${context.businessName || 'Your Business'}">`,
      ``,
      `<!-- Twitter Card Tags -->`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${this.escapeHtml(title)}">`,
      `<meta name="twitter:description" content="${this.escapeHtml(description)}">`,
      `<meta name="twitter:image" content="${image}">`,
    ];

    return metaTags.join('\n');
  }

  private generateKeywords(finding: Finding): string {
    const keywords = [
      finding.title,
      finding.category,
      'optimization',
      'SEO',
    ];
    return keywords.join(', ');
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}
