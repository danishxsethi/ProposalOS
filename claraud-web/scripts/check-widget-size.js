#!/usr/bin/env node

/**
 * Widget Size Verification Script
 *
 * Verifies that the embeddable audit widget meets the <50KB requirement.
 * Checks both raw and gzipped sizes.
 *
 * Usage: node scripts/check-widget-size.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WIDGET_PATH = path.join(__dirname, '../../public/widget.js');
const MAX_SIZE_KB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

function checkWidgetSize() {
  console.log('🔍 Widget Size Verification\n');
  console.log('='.repeat(50));

  // Check if widget file exists
  if (!fs.existsSync(WIDGET_PATH)) {
    console.error(`❌ Widget file not found at: ${WIDGET_PATH}`);
    process.exit(1);
  }

  // Read widget content
  const content = fs.readFileSync(WIDGET_PATH, 'utf8');
  const rawSize = Buffer.byteLength(content, 'utf8');

  // Calculate gzipped size
  const gzipped = zlib.gzipSync(content);
  const gzippedSize = gzipped.length;

  // Calculate minified size (simple minification - remove comments and extra whitespace)
  const minified = content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
  const minifiedSize = Buffer.byteLength(minified, 'utf8');

  // Results
  console.log(`\n📦 Widget File: public/widget.js\n`);
  console.log(`   Raw Size:      ${formatBytes(rawSize)}`);
  console.log(`   Minified:      ${formatBytes(minifiedSize)}`);
  console.log(`   Gzipped:       ${formatBytes(gzippedSize)}`);
  console.log(`\n   Target:        < ${formatBytes(MAX_SIZE_BYTES)}\n`);
  console.log('='.repeat(50));

  // Validation
  const passed = gzippedSize < MAX_SIZE_BYTES;

  if (passed) {
    console.log(
      `\n✅ PASS: Widget size (${formatBytes(gzippedSize)}) is under ${formatBytes(MAX_SIZE_BYTES)} limit\n`
    );
    console.log('📊 Size Breakdown:');
    console.log(
      `   • ${formatBytes(gzippedSize)} gzipped (${((gzippedSize / MAX_SIZE_BYTES) * 100).toFixed(1)}% of limit)`
    );
    console.log(`   • ${formatBytes(minifiedSize)} minified`);
    console.log(`   • ${formatBytes(rawSize)} raw\n`);
    process.exit(0);
  } else {
    console.error(
      `\n❌ FAIL: Widget size (${formatBytes(gzippedSize)}) exceeds ${formatBytes(MAX_SIZE_BYTES)} limit\n`
    );
    console.error('📊 Size Breakdown:');
    console.error(
      `   • ${formatBytes(gzippedSize)} gzipped (${((gzippedSize / MAX_SIZE_BYTES) * 100).toFixed(1)}% of limit)`
    );
    console.error(`   • ${formatBytes(minifiedSize)} minified`);
    console.error(`   • ${formatBytes(rawSize)} raw\n`);
    console.error('💡 Recommendations:');
    console.error('   • Remove unused code or dependencies');
    console.error('   • Consider lazy-loading non-critical features');
    console.error('   • Use more efficient string concatenation\n');
    process.exit(1);
  }
}

// Run check
checkWidgetSize();
