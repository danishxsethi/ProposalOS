import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

import OnboardingWizard from './OnboardingWizard';

export default async function OnboardingPage() {
  const session = await auth();
  const tenantId =
    session?.user && 'tenantId' in session.user
      ? (session.user as { tenantId?: string }).tenantId
      : undefined;

  if (!tenantId) {
    redirect('/login');
  }

  // Fetch tenant and branding context inside tenant's RLS scope
  const [tenant, branding] = await runWithTenantAsync(tenantId, () =>
    Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.tenantBranding.findUnique({ where: { tenantId } }),
    ])
  );

  if (!tenant) {
    redirect('/login');
  }

  // Pre-initialize step from tenant settings if available
  const settingsObj = (tenant.settings as Record<string, any>) || {};
  const initialStep =
    typeof settingsObj.currentOnboardingStep === 'number' ? settingsObj.currentOnboardingStep : 1;

  // Format serializable props to prevent date/complex-type hydration errors
  const serializedTenant = {
    id: tenant.id,
    name: tenant.name,
    planTier: tenant.planTier,
    status: tenant.status,
  };

  const serializedBranding = branding
    ? {
        brandName: branding.brandName,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
      }
    : null;

  return (
    <OnboardingWizard
      tenant={serializedTenant}
      branding={serializedBranding}
      initialStep={initialStep}
    />
  );
}

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Onboarding | ProposalOS',
  description: 'Interactive self-serve onboarding wizard for ProposalOS white-labeled services.',
};
