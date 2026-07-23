const fs = require('fs');

const files = [
    'lib/pipeline/__tests__/crossTenantIntelligence.test.ts',
    'lib/pipeline/__tests__/learningLoop.test.ts',
    'lib/pipeline/__tests__/preWarming.property.test.ts',
    'lib/pipeline/__tests__/outreach.property.test.ts',
    'lib/pipeline/__tests__/tenantIsolation.property.test.ts',
    'lib/pipeline/__tests__/tenantConfig.test.ts',
    'lib/pipeline/__tests__/stateMachine.property.test.ts',
    'lib/pipeline/__tests__/humanReview.test.ts',
    'lib/pipeline/__tests__/crossTenantIntelligence.property.test.ts',
    'lib/pipeline/__tests__/orchestrator.property.test.ts',
    'lib/pipeline/__tests__/learningLoop.property.test.ts',
    'lib/pipeline/__tests__/partnerPortal.property.test.ts',
    'lib/pipeline/__tests__/partnerPortal.test.ts',
    'lib/pipeline/__tests__/signalDetector.property.test.ts',
    'app/api/cron/partner-matching/__tests__/route.test.ts'
];

for (const file of files) {
    try {
        if (!fs.existsSync(file)) continue;

        let content = fs.readFileSync(file, 'utf8');
        let original = content;

        if (content.includes('deleteMany')) {
            // Find sequences of deleteMany calls
            content = content.replace(/(?:^[ \t]*await\s+prisma\.[a-zA-Z0-9_]+\.deleteMany\([^)]*\);?\s*)+/gm, '    await cleanupDb(prisma);\n');

            if (!content.includes('cleanupDb')) {
                // Try finding any import that has 'prisma'
                if (content.includes("from '@/lib/prisma'") || content.includes("from '@/lib/db'")) {
                    content = content.replace(/(import .* from '@\/lib\/(?:prisma|db)';?\s*\n)/, `$1import { cleanupDb } from '@/lib/__tests__/utils/cleanup';\n`);
                } else {
                    content = `import { cleanupDb } from '@/lib/__tests__/utils/cleanup';\n` + content;
                }
            }

            if (content !== original) {
                fs.writeFileSync(file, content);
                console.log(`Updated ${file}`);
            }
        }
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
}
