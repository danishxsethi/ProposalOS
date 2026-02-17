#!/usr/bin/env npx tsx
/**
 * Populate data/saskatoon-targets.json from build-targets output.
 * Run: npm run build-targets  (first)
 * Then: npx tsx scripts/populate-targets-from-build.ts
 *
 * Maps scripts/output/saskatoon-targets.json → data/saskatoon-targets.json
 */

import * as fs from 'fs';
import * as path from 'path';

const BUILD_OUTPUT = path.join(process.cwd(), 'scripts', 'output', 'saskatoon-targets.json');
const DATA_TARGETS = path.join(process.cwd(), 'data', 'saskatoon-targets.json');

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

interface BuildTarget {
    businessName: string;
    placeId: string;
    website: string;
    phone?: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    category?: string;
    vertical: string;
}

interface DataTarget {
    id: number;
    businessName: string;
    url: string;
    vertical: string;
    gbpUrl: string;
    address: string;
    status: string;
    auditId: string | null;
    qaScore: number | null;
    notes: string;
}

function main(): void {
    if (!fs.existsSync(BUILD_OUTPUT)) {
        console.error(`Run npm run build-targets first. Expected: ${BUILD_OUTPUT}`);
        process.exit(1);
    }

    const buildTargets = JSON.parse(fs.readFileSync(BUILD_OUTPUT, 'utf-8')) as BuildTarget[];
    const existing = fs.existsSync(DATA_TARGETS)
        ? (JSON.parse(fs.readFileSync(DATA_TARGETS, 'utf-8')) as { targets: DataTarget[] })
        : { targets: [] };

    const byVertical = new Map<string, DataTarget[]>();
    for (const t of existing.targets) {
        const arr = byVertical.get(t.vertical) ?? [];
        arr.push(t);
        byVertical.set(t.vertical, arr);
    }

    let updated = 0;
    for (const b of buildTargets) {
        const vertical = VERTICAL_MAP[b.vertical] ?? b.vertical;
        const slots = byVertical.get(vertical) ?? [];
        const emptySlot = slots.find((s) => !s.url && !s.businessName);
        if (emptySlot) {
            emptySlot.businessName = b.businessName;
            emptySlot.url = b.website || '';
            emptySlot.address = b.address || '';
            emptySlot.gbpUrl = b.placeId
                ? `https://www.google.com/maps/place/?q=place_id:${b.placeId}`
                : '';
            updated++;
        }
    }

    const targets = Array.from(byVertical.values()).flat();
    targets.sort((a, b) => a.id - b.id);

    fs.writeFileSync(
        DATA_TARGETS,
        JSON.stringify({ targets }, null, 2),
        'utf-8'
    );

    console.log(`Updated ${updated} targets in ${DATA_TARGETS}`);
    console.log(`Total: ${targets.filter((t) => t.url).length} with URLs`);
}

main();
