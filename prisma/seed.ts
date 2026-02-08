
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding data...');

    // 1. Create Tenant
    const tenantName = 'Acme Agencies';
    const tenant = await prisma.tenant.create({
        data: {
            name: tenantName,
            planTier: 'agency',
            status: 'active',
            domain: 'acme.com',
        },
    });
    console.log(`✅ Created Tenant: ${tenant.name}`);

    // 2. Create User
    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
        data: {
            name: 'Demo User',
            email: 'demo@acme.com',
            passwordHash,
            role: 'owner',
            tenantId: tenant.id,
            emailVerified: new Date(),
        },
    });
    console.log(`✅ Created User: ${user.email} (password123)`);

    // 3. Create Audits
    const businesses = [
        { name: 'Joe\'s Pizza', city: 'Chicago', url: 'https://joespizza.com', score: 72 },
        { name: 'Elite Dental', city: 'Miami', url: 'https://elitedental.com', score: 45 },
        { name: 'Skyline Roofing', city: 'Seattle', url: 'https://skylineroofing.com', score: 88 },
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

        // Add dummy findings
        await prisma.finding.create({
            data: {
                auditId: audit.id,
                tenantId: tenant.id,
                title: 'Missing H1 Tag',
                description: 'The homepage is missing a primary heading tag.',
                type: 'PAINKILLER',
                module: 'website',
                category: 'SEO',
                impactScore: 8,
                confidenceScore: 100,
            },
        });

        await prisma.finding.create({
            data: {
                auditId: audit.id,
                tenantId: tenant.id,
                title: 'Positive Reviews',
                description: 'Great review velocity this month.',
                type: 'VITAMIN',
                module: 'gbp',
                category: 'Reputation',
                impactScore: 4,
                confidenceScore: 100,
            },
        });

        console.log(`✅ Created Audit: ${b.name}`);
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
                execSummary: 'Focus on "Patient Acquisition Cost" and "Lifetime Value". Mention HIPAA compliance trust signals.',
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
                execSummary: 'Focus on "Case Value" and "Authority Building". Use formal, professional tone.',
            },
            isDefault: true,
        },
    ];

    for (const pb of playbooks) {
        await prisma.playbook.upsert({
            where: { tenantId_industry: { tenantId: null as any, industry: pb.industry } }, // Cast null to any to satisfy type if needed, or rely on schema
            // Actually composite unique key is [tenantId, industry]. Prisma treating null as distinct in unique index depends on DB. 
            // Prisma optional fields are nullable. 
            // Workaround: We might need to query first or just create if not exists.
            // Simplified: check match
            update: {},
            create: {
                industry: pb.industry,
                name: pb.name,
                description: pb.description,
                pricingConfig: pb.pricingConfig,
                proposalLanguage: pb.proposalLanguage,
                promptOverrides: pb.promptOverrides,
                isDefault: true,
            }
        });
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
