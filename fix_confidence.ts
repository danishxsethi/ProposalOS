import fs from 'fs';
import path from 'path';

const modulesDir = path.join(__dirname, 'lib', 'modules');

function processFile(filePath: string) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // We only want to import normalizeConfidence if we actually use it
    let modified = false;

    // Replace confidenceScore: <number>
    // We need to carefully replace numerical confidenceScore with normalizeConfidence
    // Examples: confidenceScore: 9.5, confidenceScore: 90, confidenceScore: 10, confidenceScore: 0.8
    // If it's 9.5, 9.0, 95, 90, etc.
    content = content.replace(/confidenceScore:\s*([0-9.]+)/g, (match, scoreStr) => {
        let score = parseFloat(scoreStr);
        // exclude already converted ones or variables
        if (isNaN(score)) return match;

        let scale = "'1-10'";
        if (score > 10) scale = "'0-100'";
        // Let's assume pagespeed is only in findingGenerator.ts, which we'll handle separately or pass '0-100'.

        return `confidenceScore: normalizeConfidence(${score}, ${scale})`;
    });

    if (content !== original) {
        // Add import if not present
        if (!content.includes('normalizeConfidence')) {
            if (filePath.endsWith('findingGenerator.ts')) {
                // It will be defined here, no need to import
            } else {
                content = `import { normalizeConfidence } from './findingGenerator';\n` + content;
            }
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
