import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const testRoots = ['app', 'components', 'lib', 'tests', 'scripts'];
const skipPattern = /\b(?:describe|it|test)\s*\.\s*(?:skip|todo)\s*\(|\bskipIf\s*\(/g;
const files: string[] = [];

function visit(directory: string): void {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', 'coverage'].includes(entry.name)) visit(absolute);
    } else if (/\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
}

for (const rootName of testRoots) visit(path.join(root, rootName));
const skips: string[] = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(skipPattern)) {
    const prefix = content.slice(0, match.index ?? 0);
    const line = prefix.split('\n').length;
    skips.push(`${path.relative(root, file)}:${line}:${match[0]}`);
  }
}

console.log(`Explicit skipped/todo tests: ${skips.length}`);
for (const skip of skips) console.log(skip);
