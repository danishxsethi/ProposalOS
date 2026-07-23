const fs = require('fs');
const path = require('path');

const dir = 'lib/pipeline/__tests__';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

for (const file of files) {
    const fullPath = path.join(dir, file);
    let content = fs.readFileSync(fullPath, 'utf8');

    if (content.includes('cleanupDb') && !content.includes('import { cleanupDb')) {
        content = `import { cleanupDb } from '@/lib/__tests__/utils/cleanup';\n` + content;
        fs.writeFileSync(fullPath, content);
        console.log(`Fixed imports in ${file}`);
    }
}
