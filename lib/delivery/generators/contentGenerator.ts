import { Finding } from '@prisma/client';
import { RawArtifact, ArtifactGenerator } from './schemaGenerator';

/**
 * Content Generator - Generates content briefs and drafts for blog posts, service pages, FAQ sections
 */
export class ContentGenerator implements ArtifactGenerator {
  async generate(finding: Finding, proposalContext: Record<string, any>): Promise<RawArtifact> {
    const contentType = this.determineContentType(finding);
    const content = this.generateContent(contentType, finding, proposalContext);

    return {
      content,
      artifactType: 'content_brief',
      metadata: {
        findingId: finding.id,
        generatedAt: new Date(),
        category: finding.category,
      },
    };
  }

  getArtifactType(): string {
    return 'content_brief';
  }

  supportsWordPress(): boolean {
    return true;
  }

  async generateWordPressPlugin(finding: Finding, artifact: RawArtifact): Promise<string> {
    return `<?php
/**
 * Plugin Name: Content - ${finding.title}
 * Description: Auto-generated content for ${finding.title}
 * Version: 1.0.0
 */

add_action('wp_insert_post_data', function(\$data) {
    if (\$data['post_type'] === 'post' && strpos(\$data['post_content'], '${finding.title}') !== false) {
        // Content already exists
        return \$data;
    }
    return \$data;
});

// Register custom post type for content briefs
add_action('init', function() {
    register_post_type('content_brief', array(
        'public' => true,
        'label' => 'Content Briefs'
    ));
});
?>`;
  }

  private determineContentType(finding: Finding): string {
    const description = (finding.description || '').toLowerCase();

    if (description.includes('blog') || description.includes('article')) {
      return 'blog_post';
    }
    if (description.includes('service') || description.includes('page')) {
      return 'service_page';
    }
    if (description.includes('faq') || description.includes('question')) {
      return 'faq_section';
    }
    return 'blog_post';
  }

  private generateContent(type: string, finding: Finding, context: Record<string, any>): string {
    switch (type) {
      case 'blog_post':
        return this.generateBlogPost(finding, context);
      case 'service_page':
        return this.generateServicePage(finding, context);
      case 'faq_section':
        return this.generateFAQSection(finding, context);
      default:
        return this.generateBlogPost(finding, context);
    }
  }

  private generateBlogPost(finding: Finding, context: Record<string, any>): string {
    return `
# Blog Post Brief: ${finding.title}

## Content Strategy
- **Target Audience:** ${context.targetAudience || 'Business owners and decision makers'}
- **Content Type:** Educational/Informational
- **Estimated Length:** 1,500-2,000 words
- **SEO Focus:** ${finding.title}, optimization, best practices

## Outline

### Introduction (150-200 words)
- Hook: Start with a compelling statistic or question related to ${finding.title}
- Problem statement: Explain why this topic matters
- Solution preview: Briefly mention what readers will learn

### Section 1: Understanding ${finding.title} (300-400 words)
- Define the concept
- Explain its importance
- Provide context and background

### Section 2: Key Benefits (300-400 words)
- Benefit 1: Improved efficiency
- Benefit 2: Cost savings
- Benefit 3: Better outcomes

### Section 3: Best Practices (400-500 words)
- Practice 1: Implementation strategy
- Practice 2: Common mistakes to avoid
- Practice 3: Optimization tips

### Section 4: Case Study or Example (300-400 words)
- Real-world example
- Results achieved
- Lessons learned

### Conclusion (150-200 words)
- Summarize key points
- Call to action
- Next steps for readers

## Meta Information
- **Meta Title:** ${finding.title} - Complete Guide (60 characters)
- **Meta Description:** Learn about ${finding.title} and how to implement best practices. (160 characters)
- **Keywords:** ${finding.title}, optimization, best practices, guide

## Internal Links
- Link to related service pages
- Link to other relevant blog posts
- Link to contact/consultation page

## Call to Action
"Ready to implement ${finding.title}? Contact us for a free consultation."
`.trim();
  }

  private generateServicePage(finding: Finding, context: Record<string, any>): string {
    return `
# Service Page Brief: ${finding.title}

## Page Structure

### Hero Section
- **Headline:** ${finding.title} Services for ${context.businessCity || 'Your Business'}
- **Subheadline:** Professional solutions tailored to your needs
- **CTA Button:** Get Started / Schedule Consultation

### Overview Section (200-300 words)
Introduce the service and its value proposition. Explain what clients can expect and the benefits they'll receive.

### Key Features/Benefits (4-5 bullet points)
- Feature 1: Description
- Feature 2: Description
- Feature 3: Description
- Feature 4: Description
- Feature 5: Description

### Service Process (4-5 steps)
1. **Discovery:** Initial consultation and needs assessment
2. **Planning:** Develop customized strategy
3. **Implementation:** Execute the plan
4. **Optimization:** Monitor and refine
5. **Support:** Ongoing assistance and updates

### Why Choose Us (300-400 words)
- Expertise and experience
- Proven track record
- Customer-focused approach
- Competitive pricing
- Dedicated support

### Testimonials Section
Include 2-3 customer testimonials with:
- Customer name and business
- Quote about the service
- Results achieved
- Star rating

### FAQ Section
- Q: What is included in this service?
- Q: How long does it take?
- Q: What is the cost?
- Q: Do you offer support after completion?

### Call to Action Section
- Primary CTA: Schedule Consultation
- Secondary CTA: Learn More / Get Quote

## Meta Information
- **Meta Title:** ${finding.title} Services (60 characters)
- **Meta Description:** Professional ${finding.title} services. (160 characters)
- **Keywords:** ${finding.title}, services, solutions, consultation
`.trim();
  }

  private generateFAQSection(finding: Finding, context: Record<string, any>): string {
    return `
# FAQ Section Brief: ${finding.title}

## Frequently Asked Questions

### Q1: What is ${finding.title}?
A: ${finding.title} is a service/solution that helps businesses improve their operations and achieve better results. It involves [specific explanation].

### Q2: Why is ${finding.title} important?
A: ${finding.title} is important because it:
- Improves efficiency
- Reduces costs
- Enhances customer satisfaction
- Provides competitive advantage

### Q3: How does ${finding.title} work?
A: The process involves:
1. Initial assessment
2. Strategy development
3. Implementation
4. Monitoring and optimization

### Q4: What are the benefits of ${finding.title}?
A: Key benefits include:
- Increased productivity
- Better results
- Cost savings
- Improved customer experience

### Q5: How long does ${finding.title} take?
A: The timeline depends on your specific needs, but typically:
- Initial consultation: 1-2 weeks
- Implementation: 4-8 weeks
- Optimization: Ongoing

### Q6: What is the cost of ${finding.title}?
A: Pricing varies based on scope and complexity. We offer customized quotes based on your specific requirements. Contact us for a free estimate.

### Q7: Do you provide support after ${finding.title} is implemented?
A: Yes, we provide ongoing support including:
- Regular monitoring
- Performance reports
- Optimization recommendations
- Technical assistance

### Q8: Can ${finding.title} be customized for our business?
A: Absolutely. We tailor all solutions to meet your specific business needs and goals.

### Q9: What results can we expect from ${finding.title}?
A: Results vary by business, but clients typically see:
- [Specific metric] improvement
- [Specific metric] increase
- [Specific metric] reduction

### Q10: How do I get started with ${finding.title}?
A: Getting started is easy:
1. Contact us for a free consultation
2. Discuss your needs and goals
3. Receive a customized proposal
4. Begin implementation

## Schema Markup
Include FAQ schema markup for search engines to display rich snippets.
`.trim();
  }
}
