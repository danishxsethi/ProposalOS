import { Finding } from '@prisma/client';
import { RawArtifact, ArtifactGenerator } from './schemaGenerator';

/**
 * GBP Generator - Generates Google Business Profile content drafts
 */
export class GBPGenerator implements ArtifactGenerator {
  async generate(finding: Finding, proposalContext: Record<string, any>): Promise<RawArtifact> {
    const contentType = this.determineContentType(finding);
    const content = this.generateGBPContent(contentType, finding, proposalContext);

    return {
      content,
      artifactType: 'gbp_draft',
      metadata: {
        findingId: finding.id,
        generatedAt: new Date(),
        category: finding.category,
      },
    };
  }

  getArtifactType(): string {
    return 'gbp_draft';
  }

  supportsWordPress(): boolean {
    return false;
  }

  private determineContentType(finding: Finding): string {
    const description = (finding.description || '').toLowerCase();

    if (description.includes('description') || description.includes('about')) {
      return 'business_description';
    }
    if (description.includes('categor')) {
      return 'categories';
    }
    if (description.includes('question') || description.includes('faq')) {
      return 'qa';
    }
    if (description.includes('post') || description.includes('update')) {
      return 'posts';
    }
    return 'business_description';
  }

  private generateGBPContent(type: string, finding: Finding, context: Record<string, any>): string {
    switch (type) {
      case 'business_description':
        return this.generateBusinessDescription(finding, context);
      case 'categories':
        return this.generateCategories(finding, context);
      case 'qa':
        return this.generateQA(finding, context);
      case 'posts':
        return this.generatePosts(finding, context);
      default:
        return this.generateBusinessDescription(finding, context);
    }
  }

  private generateBusinessDescription(finding: Finding, context: Record<string, any>): string {
    const businessName = context.businessName || 'Your Business';
    const industry = context.industry || 'Service Provider';

    return `
# Business Description for Google Business Profile

## Primary Description (750 characters max)

${businessName} is a leading ${industry} serving the ${context.businessCity || 'local'} area. We specialize in ${finding.title} and are committed to delivering exceptional service to our clients.

With years of experience in the industry, we pride ourselves on:
- High-quality service delivery
- Customer satisfaction and support
- Professional and knowledgeable team
- Competitive pricing and transparent communication

## Additional Information

**Service Area:** ${context.businessCity || 'Local area'}
**Hours:** Monday-Friday 9AM-5PM, Saturday by appointment
**Contact:** ${context.businessPhone || '(555) 000-0000'}

## Key Highlights

- ${finding.title}
- Professional expertise
- Customer-focused approach
- Proven track record
`.trim();
  }

  private generateCategories(finding: Finding, context: Record<string, any>): string {
    return `
# Google Business Profile Categories

## Primary Category
${context.industry || 'Service Provider'}

## Additional Categories
- ${finding.title}
- Local Business
- Professional Services

## Service Categories
- Consultation
- Service Delivery
- Customer Support

**Note:** Select the most relevant categories that accurately describe your business. Google allows up to 10 categories.
`.trim();
  }

  private generateQA(finding: Finding, context: Record<string, any>): string {
    return `
# Google Business Profile Q&A

## Question 1
**Q: What services do you offer?**
A: We specialize in ${finding.title} and related services. Our team is dedicated to providing high-quality solutions tailored to your needs.

## Question 2
**Q: What is your service area?**
A: We serve the ${context.businessCity || 'local'} area and surrounding regions. Contact us to discuss your specific location.

## Question 3
**Q: How can I schedule a consultation?**
A: You can reach us at ${context.businessPhone || '(555) 000-0000'} or visit our website to book an appointment.

## Question 4
**Q: Do you offer emergency services?**
A: Yes, we offer emergency services. Please call us for immediate assistance.

## Question 5
**Q: What are your hours of operation?**
A: We're open Monday-Friday 9AM-5PM, and Saturday by appointment. Contact us for holiday hours.
`.trim();
  }

  private generatePosts(finding: Finding, context: Record<string, any>): string {
    return `
# Google Business Profile Posts

## Post 1: Service Highlight
**Title:** ${finding.title} - Expert Solutions

We're excited to announce our specialized services in ${finding.title}. Our experienced team is ready to help you achieve your goals. Learn more about how we can assist you!

**Call to Action:** Learn More | Book Now

---

## Post 2: Seasonal Promotion
**Title:** Special Offer This Month

Take advantage of our limited-time offer on ${finding.title} services. Contact us today to learn about our current promotions and discounts.

**Call to Action:** Get Offer | Contact Us

---

## Post 3: Customer Testimonial
**Title:** Trusted by Our Customers

"${context.businessName} provided exceptional service and exceeded our expectations. Highly recommended!" - Satisfied Customer

**Call to Action:** Read Reviews | Contact Us

---

## Post 4: Educational Content
**Title:** Tips for ${finding.title}

Learn valuable tips and best practices for ${finding.title}. Our experts share insights to help you make informed decisions.

**Call to Action:** Learn More | Contact Us
`.trim();
  }
}
