import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const maliciousIcns = [
  0x69, 0x63, 0x6e, 0x73, 0x00, 0x00, 0x00, 0x10, 0x69, 0x73, 0x33, 0x32, 0x00, 0x00, 0x00,
  0x00,
];

const maliciousHeif = [
  0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x24, 0x6d, 0x65, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x08, 0x69, 0x70, 0x72, 0x70, 0x00, 0x00, 0x00, 0x14, 0x69, 0x70, 0x63, 0x6f, 0x00, 0x00,
  0x00, 0x00, 0x69, 0x73, 0x70, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

const maliciousJxl = [
  0x00, 0x00, 0x00, 0x10, 0x4a, 0x58, 0x4c, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6a, 0x78, 0x6c,
  0x20, 0x00, 0x00, 0x00, 0x10, 0x6a, 0x78, 0x6c, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00,
];

describe('image-size patched parser advisory regressions', () => {
  it.each([
    ['ICNS', maliciousIcns],
    ['HEIF', maliciousHeif],
    ['JXL', maliciousJxl],
  ])('rejects zero-length %s boxes without hanging', (format, bytes) => {
    const child = spawnSync(
      process.execPath,
      [
        '-e',
        `const {imageSize}=require('image-size'); try { imageSize(Buffer.from(${JSON.stringify(bytes)})); process.exit(2); } catch (error) { if (error instanceof TypeError) process.exit(0); console.error(error); process.exit(3); }`,
      ],
      { encoding: 'utf8', timeout: 2000 }
    );

    expect(child.error, `${format} parser must complete before timeout`).toBeUndefined();
    expect(child.status, `${format} parser should reject malformed bytes`).toBe(0);
  });

  it('rejects image-size versions at or below the advisory boundary', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        "const fs=require('node:fs'),path=require('node:path');let d=path.dirname(require.resolve('image-size'));while(true){const p=path.join(d,'package.json');if(fs.existsSync(p)&&JSON.parse(fs.readFileSync(p,'utf8')).name==='image-size'){const v=JSON.parse(fs.readFileSync(p,'utf8')).version;console.log(v);if(v==='2.0.4')process.exit(0);process.exit(1)}d=path.dirname(d)}",
      ],
      { encoding: 'utf8', timeout: 2000 }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('2.0.4');
  });
});
