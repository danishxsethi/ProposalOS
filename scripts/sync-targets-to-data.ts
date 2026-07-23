#!/usr/bin/env npx tsx
/**
 * Sync build-targets output to data/saskatoon-targets.json for batch-audit.
 * Run after: npm run build-targets
 *
 * Usage: npx tsx scripts/sync-targets-to-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(process.cwd(), 'scripts', 'output', 'saskatoon-targets.json');
const DEST = path.join(process.cwd(), 'data', 'saskatoon-targets.json');

interface BuildTarget {
  businessName: string;
  website: string;
  address: string;
  vertical: string;
  placeId?: string;
}

const VERTICAL_MAP: Record<string, string> = {
  dentist: 'dentist',
  'law-firm': 'law-firm',
  hvac: 'hvac',
  restaurant: 'restaurant',
  'real-estate': 'real-estate',
  gym: 'gym',
  veterinarian: 'veterinary',
  'hair-salon': 'salon',
  'home-contractor': 'contractor',
  retail: 'retail',
};

function main(): void {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    console.error('Run: npm run build-targets');
    process.exit(1);
  }

  const raw = fs.readFileSync(SOURCE, 'utf-8');
  const buildTargets = JSON.parse(raw) as BuildTarget[];

  const targets = buildTargets
    .filter((t) => t.website && t.website.startsWith('http'))
    .map((t, i) => ({
      id: i + 1,
      businessName: t.businessName,
      url: t.website,
      vertical: VERTICAL_MAP[t.vertical] || t.vertical,
      gbpUrl: t.placeId ? `https://www.google.com/maps/place/?q=place_id:${t.placeId}` : '',
      address: t.address || '',
      status: 'pending' as const,
      auditId: null as string | null,
      qaScore: null as number | null,
      notes: '',
    }));

  const dir = path.dirname(DEST);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(DEST, JSON.stringify({ targets }, null, 2), 'utf-8');
  console.log(`Synced ${targets.length} targets to ${DEST}`);
}

main();
