import bcrypt from 'bcryptjs';

import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

export interface ProvisionInput {
  orgName: string;
  ownerEmail: string;
  password: string;
  plan?: string;
}

export class TenantProvisioningService {
  /**
   * Transactionally creates a Tenant and its first owner user,
   * configures default branding, seeds playbooks, and records audit trail.
   */
  static async provision({ orgName, ownerEmail, password, plan = 'free' }: ProvisionInput) {
    const emailLower = ownerEmail.toLowerCase().trim();

    // 1. Globally check for duplicate owner email across all tenants using runWithTenantBypass
    const existingUser = await runWithTenantBypass('onboarding-identity-check', async () => {
      return await prisma.user.findUnique({
        where: { email: emailLower },
      });
    });

    if (existingUser) {
      throw new Error('An account with this email address already exists.');
    }

    // 2. Generate slug and ensure uniqueness
    const baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slugBase = baseSlug || 'org';

    const newTenant = await runWithTenantBypass('create-new-tenant', async () => {
      let uniqueSlug = slugBase;
      let counter = 1;
      while (true) {
        const existing = await prisma.tenant.findUnique({ where: { slug: uniqueSlug } });
        if (!existing) break;
        uniqueSlug = `${slugBase}-${counter}`;
        counter++;
      }

      return await prisma.tenant.create({
        data: {
          name: orgName,
          slug: uniqueSlug,
          planTier: plan,
          status: 'active',
          subscriptionStatus: plan === 'free' ? 'inactive' : 'active',
          settings: { currentOnboardingStep: 1 },
        },
      });
    });

    const tenantId = newTenant.id;

    // 3. Perform subsequent writes within the newly created tenant context
    const result = await runWithTenantAsync(tenantId, async () => {
      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create the owner user
      const ownerUser = await prisma.user.create({
        data: {
          email: emailLower,
          name: orgName + ' Owner',
          passwordHash,
          role: 'owner',
          tenantId: tenantId,
        },
      });

      // Create TenantBranding configuration
      await prisma.tenantBranding.create({
        data: {
          tenantId: tenantId,
          brandName: orgName,
          primaryColor: '#8B5CF6',
          secondaryColor: '#38BDF8',
          accentColor: '#F59E0B',
        },
      });

      // Seed playbooks
      // Query system-wide playbooks (tenantId IS NULL)
      const systemPlaybooks = await prisma.playbook.findMany({
        where: { tenantId: null },
      });

      if (systemPlaybooks.length > 0) {
        for (const sysPlaybook of systemPlaybooks) {
          await prisma.playbook.create({
            data: {
              tenantId: tenantId,
              industry: sysPlaybook.industry,
              name: sysPlaybook.name,
              description: sysPlaybook.description,
              moduleConfig: sysPlaybook.moduleConfig ?? {},
              pricingConfig: sysPlaybook.pricingConfig ?? {},
              promptOverrides: sysPlaybook.promptOverrides ?? {},
              customFindings: sysPlaybook.customFindings ?? [],
              proposalLanguage: sysPlaybook.proposalLanguage ?? {},
              isDefault: sysPlaybook.isDefault,
            },
          });
        }
      } else {
        // Fallback to defaults (dental, hvac, legal) if no system playbooks exist
        const playbooksFallback = [
          {
            industry: 'dental',
            name: 'Dental & Orthodontics',
            description: 'Focused on patient trust, HIPAA, and appointment booking.',
            pricingConfig: { starter: 1500, growth: 3000, premium: 5000 },
            proposalLanguage: {
              valueProp: 'Attract high-value patients for invisalign and implants.',
              painPoints: ['Empty chair time', 'Low review velocity', 'Poor local ranking'],
            },
            promptOverrides: {
              execSummary:
                'Focus on "Patient Acquisition Cost" and "Lifetime Value". Mention HIPAA compliance trust signals.',
            },
            isDefault: true,
          },
          {
            industry: 'hvac',
            name: 'HVAC & Plumbing',
            description: 'Focused on emergency service, local area, and seasonality.',
            pricingConfig: { starter: 1200, growth: 2500, premium: 4500 },
            proposalLanguage: {
              valueProp: 'Dominate local emergency searches and fill your schedule.',
              painPoints: ['Seasonal slumps', 'Wasted ad spend', 'Missed emergency calls'],
            },
            promptOverrides: {
              execSummary:
                'Emphasize "Emergency Response Visibility" and "Service Area Dominance".',
            },
            isDefault: true,
          },
          {
            industry: 'legal',
            name: 'Legal & Law Firms',
            description: 'High-ticket lead generation with focus on authority and trust.',
            pricingConfig: { starter: 2500, growth: 5000, premium: 10000 },
            proposalLanguage: {
              valueProp: 'Secure high-value cases and establish practice authority.',
              painPoints: ['Low lead quality', 'High CPC', 'Lack of authority'],
            },
            promptOverrides: {
              execSummary:
                'Focus on "Case Value" and "Authority Building". Use formal, professional tone.',
            },
            isDefault: true,
          },
        ];

        for (const pb of playbooksFallback) {
          await prisma.playbook.create({
            data: {
              tenantId: tenantId,
              industry: pb.industry,
              name: pb.name,
              description: pb.description,
              pricingConfig: pb.pricingConfig,
              proposalLanguage: pb.proposalLanguage,
              promptOverrides: pb.promptOverrides,
              isDefault: pb.isDefault,
            },
          });
        }
      }

      // Record the audit event
      await recordAuditTrailEvent({
        eventType: 'tenant.provisioned',
        tenantId: tenantId,
        actorId: ownerUser.id,
        payload: {
          orgName,
          ownerEmail: emailLower,
          plan,
        },
      });

      return { tenantId, userId: ownerUser.id, email: emailLower };
    });

    return result;
  }
}
