import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding data...');

  // 1. Create or get System Tenant (for Claraud frontend API access)
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: 'system' },
    update: {},
    create: {
      name: 'System',
      slug: 'system',
      domain: 'system.proposalengine.app',
      planTier: 'pro',
      status: 'active',
    },
  });
  console.log(`✅ Created System Tenant: ${systemTenant.name} (ID: ${systemTenant.id})`);

  // 2. Create or get Tenant
  const tenantName = 'Acme Agencies';
  const tenant = await prisma.tenant.upsert({
    where: { domain: 'acme.com' },
    update: {},
    create: {
      name: tenantName,
      planTier: 'agency',
      status: 'active',
      domain: 'acme.com',
    },
  });
  console.log(`✅ Created Tenant: ${tenant.name}`);
  console.log(`TENANT_ID=${tenant.id}`);

  // 2. Create or get User
  const passwordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@acme.com' },
    update: { passwordHash, role: 'owner', tenantId: tenant.id },
    create: {
      name: 'Demo User',
      email: 'demo@acme.com',
      passwordHash,
      role: 'owner',
      tenantId: tenant.id,
      emailVerified: new Date(),
    },
  });
  console.log(`✅ Created User: ${user.email} (password123)`);

  // 3. Create Audits across multiple industries (e-commerce, SaaS, healthcare, restaurant, legal)
  const businesses = [
    // Restaurant
    {
      name: "Joe's Pizza",
      city: 'Chicago',
      url: 'https://joespizza.com',
      score: 72,
      industry: 'restaurant',
    },
    {
      name: 'Golden Dragon Chinese',
      city: 'San Francisco',
      url: 'https://goldendragonsf.com',
      score: 55,
      industry: 'restaurant',
    },
    // Healthcare
    {
      name: 'Elite Dental',
      city: 'Miami',
      url: 'https://elitedental.com',
      score: 45,
      industry: 'healthcare',
    },
    {
      name: 'Bright Smile Orthodontics',
      city: 'Austin',
      url: 'https://brightsmileortho.com',
      score: 68,
      industry: 'healthcare',
    },
    // E-commerce
    {
      name: 'Artisan Goods Co',
      city: 'Portland',
      url: 'https://artisangoods.co',
      score: 82,
      industry: 'ecommerce',
    },
    {
      name: 'Tech Gadgets Plus',
      city: 'New York',
      url: 'https://techgadgetsplus.com',
      score: 61,
      industry: 'ecommerce',
    },
    // SaaS
    {
      name: 'CloudFlow Software',
      city: 'San Jose',
      url: 'https://cloudflow.io',
      score: 78,
      industry: 'saas',
    },
    {
      name: 'DataSync Pro',
      city: 'Boston',
      url: 'https://datasyncpro.com',
      score: 52,
      industry: 'saas',
    },
    // Legal
    {
      name: 'Morrison & Associates Law',
      city: 'Washington DC',
      url: 'https://morrisonlaw.com',
      score: 65,
      industry: 'legal',
    },
    {
      name: 'Family First Attorneys',
      city: 'Denver',
      url: 'https://familyfirstattorneys.com',
      score: 48,
      industry: 'legal',
    },
    // HVAC/Home Services
    {
      name: 'Skyline Roofing',
      city: 'Seattle',
      url: 'https://skylineroofing.com',
      score: 88,
      industry: 'hvac',
    },
    {
      name: 'Quick Fix Plumbing',
      city: 'Phoenix',
      url: 'https://quickfixplumbing.com',
      score: 41,
      industry: 'hvac',
    },
  ];

  for (const b of businesses) {
    const audit = await prisma.audit.create({
      data: {
        businessName: b.name,
        businessCity: b.city,
        businessUrl: b.url,
        overallScore: b.score,
        status: 'COMPLETE',
        tenantId: tenant.id,
        modulesCompleted: ['website', 'gbp', 'competitor'],
      },
    });

    // Industry-specific findings
    const findingsByIndustry: Record<
      string,
      Array<{
        title: string;
        description: string;
        type: string;
        module: string;
        category: string;
        impactScore: number;
      }>
    > = {
      restaurant: [
        {
          title: 'Missing Online Menu',
          description: 'No digital menu available for customers.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'UX',
          impactScore: 9,
        },
        {
          title: 'No Reservation System',
          description: 'Missing online reservation functionality.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Functionality',
          impactScore: 8,
        },
        {
          title: 'Positive Food Reviews',
          description: 'Customers praise food quality consistently.',
          type: 'VITAMIN',
          module: 'gbp',
          category: 'Reputation',
          impactScore: 5,
        },
      ],
      healthcare: [
        {
          title: 'HIPAA Compliance Gap',
          description: 'Website forms may not be HIPAA compliant.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Security',
          impactScore: 10,
        },
        {
          title: 'Missing Appointment Booking',
          description: 'No online appointment scheduling available.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Functionality',
          impactScore: 8,
        },
        {
          title: 'Strong Doctor Profiles',
          description: 'Well-written provider bios build trust.',
          type: 'VITAMIN',
          module: 'website',
          category: 'Content',
          impactScore: 4,
        },
      ],
      ecommerce: [
        {
          title: 'Slow Product Page Load',
          description: 'Product pages take >5s to load on mobile.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Performance',
          impactScore: 9,
        },
        {
          title: 'Missing Schema Markup',
          description: 'Product schema not implemented for rich snippets.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'SEO',
          impactScore: 7,
        },
        {
          title: 'Good Checkout Flow',
          description: 'Checkout process is streamlined and intuitive.',
          type: 'VITAMIN',
          module: 'website',
          category: 'UX',
          impactScore: 5,
        },
      ],
      saas: [
        {
          title: 'No Free Trial CTA',
          description: 'Free trial option not prominently displayed.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Conversion',
          impactScore: 8,
        },
        {
          title: 'Missing Pricing Page',
          description: 'Pricing information is hard to find.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'UX',
          impactScore: 7,
        },
        {
          title: 'Strong Feature Documentation',
          description: 'Comprehensive feature docs available.',
          type: 'VITAMIN',
          module: 'website',
          category: 'Content',
          impactScore: 4,
        },
      ],
      legal: [
        {
          title: 'No Attorney Profiles',
          description: 'Missing detailed attorney biography pages.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Content',
          impactScore: 7,
        },
        {
          title: 'Missing Contact Form',
          description: 'No easy way for clients to request consultation.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Conversion',
          impactScore: 9,
        },
        {
          title: 'Good Practice Area Pages',
          description: 'Well-organized practice area information.',
          type: 'VITAMIN',
          module: 'website',
          category: 'SEO',
          impactScore: 4,
        },
      ],
      hvac: [
        {
          title: 'No Emergency Contact',
          description: 'Emergency service number not prominently displayed.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'Conversion',
          impactScore: 9,
        },
        {
          title: 'Missing Service Area Map',
          description: 'Service coverage area not clearly defined.',
          type: 'PAINKILLER',
          module: 'website',
          category: 'UX',
          impactScore: 6,
        },
        {
          title: 'Good Review Response',
          description: 'Owner responds to reviews promptly.',
          type: 'VITAMIN',
          module: 'gbp',
          category: 'Reputation',
          impactScore: 5,
        },
      ],
    };

    const findings = findingsByIndustry[b.industry] ?? findingsByIndustry.restaurant;

    for (const f of findings ?? []) {
      await prisma.finding.create({
        data: {
          auditId: audit.id,
          tenantId: tenant.id,
          title: f.title,
          description: f.description,
          type: f.type as any,
          module: f.module,
          category: f.category,
          impactScore: f.impactScore,
          confidenceScore: 90 + Math.floor(Math.random() * 10),
        },
      });
    }

    console.log(`✅ Created Audit: ${b.name} (${b.industry})`);
  }

  // Seed Default Playbooks
  const playbooks = [
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
        execSummary: 'Emphasize "Emergency Response Visibility" and "Service Area Dominance".',
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

  try {
    for (const pb of playbooks) {
      await prisma.playbook.upsert({
        where: { tenantId_industry: { tenantId: tenant.id, industry: pb.industry } },
        update: {},
        create: {
          tenantId: tenant.id,
          industry: pb.industry,
          name: pb.name,
          description: pb.description,
          pricingConfig: pb.pricingConfig,
          proposalLanguage: pb.proposalLanguage,
          promptOverrides: pb.promptOverrides,
          isDefault: true,
        },
      });
    }
    console.log('✅ Seeded playbooks');
  } catch (e) {
    console.warn('⚠️ Playbook seeding skipped (table may not exist):', (e as Error).message);
  }

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
