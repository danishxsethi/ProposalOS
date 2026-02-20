const fs = require('fs');
const path = require('path');

const dir = 'lib/pipeline/__tests__';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

for (const file of files) {
    const fullPath = path.join(dir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    const orig = content;

    // Remove leftover deleteMany calls that span one or multiple lines
    content = content.replace(/await\s+prisma\.[a-zA-Z0-9_]+\.deleteMany\([^)]*\);?/g, '');

    // Clean up any double await cleanupDb(prisma) that might have been caused
    content = content.replace(/(await\s+cleanupDb\(prisma\);\s*){2,}/g, 'await cleanupDb(prisma);\n');

    if (content !== orig) {
        fs.writeFileSync(fullPath, content);
        console.log(`Cleaned ${file}`);
    }
}
