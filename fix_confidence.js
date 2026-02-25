const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, 'lib', 'modules');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    let modified = false;

    // confidenceScore: <number>
    content = content.replace(/confidenceScore:\s*([0-9.]+)/g, (match, scoreStr) => {
        let score = parseFloat(scoreStr);
        if (isNaN(score)) return match;
        let scale = "'1-10'";
        if (score > 10) scale = "'0-100'";
        // For vision.ts and manually checking findingGenerator.ts later.
        return `confidenceScore: normalizeConfidence(${score}, ${scale})`;
    });

    if (content !== original) {
        if (!content.includes('normalizeConfidence') && !filePath.endsWith('findingGenerator.ts')) {
            content = `import { normalizeConfidence } from './findingGenerator';\n` + content;
        }
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${path.basename(filePath)}`);
    }
}

const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.ts'));
for (const f of files) {
    if (f !== 'types.ts') {
        processFile(path.join(modulesDir, f));
    }
}
