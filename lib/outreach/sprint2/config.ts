export interface MetroSeed {
    city: string;
    state: string;
    metro: string;
}

export const DEFAULT_SPRINT2_VERTICALS = [
    'dental',
    'hvac',
    'legal',
    'restaurant',
    'med-spa',
] as const;

export const VERTICAL_SEARCH_QUERIES: Record<string, string[]> = {
    dental: ['dentist', 'dental clinic', 'cosmetic dentist'],
    hvac: ['hvac contractor', 'heating and cooling', 'air conditioning repair'],
    legal: ['law firm', 'attorney', 'personal injury lawyer'],
    restaurant: ['restaurant', 'family restaurant', 'local restaurant'],
    'med-spa': ['med spa', 'aesthetic clinic', 'medical spa'],
};

export const TOP_50_US_METROS: MetroSeed[] = [
    { city: 'New York', state: 'NY', metro: 'New York-Newark-Jersey City' },
    { city: 'Los Angeles', state: 'CA', metro: 'Los Angeles-Long Beach-Anaheim' },
    { city: 'Chicago', state: 'IL', metro: 'Chicago-Naperville-Elgin' },
    { city: 'Dallas', state: 'TX', metro: 'Dallas-Fort Worth-Arlington' },
    { city: 'Houston', state: 'TX', metro: 'Houston-The Woodlands-Sugar Land' },
    { city: 'Washington', state: 'DC', metro: 'Washington-Arlington-Alexandria' },
    { city: 'Philadelphia', state: 'PA', metro: 'Philadelphia-Camden-Wilmington' },
    { city: 'Atlanta', state: 'GA', metro: 'Atlanta-Sandy Springs-Alpharetta' },
    { city: 'Miami', state: 'FL', metro: 'Miami-Fort Lauderdale-West Palm Beach' },
    { city: 'Phoenix', state: 'AZ', metro: 'Phoenix-Mesa-Chandler' },
    { city: 'Boston', state: 'MA', metro: 'Boston-Cambridge-Newton' },
    { city: 'Riverside', state: 'CA', metro: 'Riverside-San Bernardino-Ontario' },
    { city: 'San Francisco', state: 'CA', metro: 'San Francisco-Oakland-Berkeley' },
    { city: 'Detroit', state: 'MI', metro: 'Detroit-Warren-Dearborn' },
    { city: 'Seattle', state: 'WA', metro: 'Seattle-Tacoma-Bellevue' },
    { city: 'Minneapolis', state: 'MN', metro: 'Minneapolis-St. Paul-Bloomington' },
    { city: 'San Diego', state: 'CA', metro: 'San Diego-Chula Vista-Carlsbad' },
    { city: 'Tampa', state: 'FL', metro: 'Tampa-St. Petersburg-Clearwater' },
    { city: 'Denver', state: 'CO', metro: 'Denver-Aurora-Lakewood' },
    { city: 'Baltimore', state: 'MD', metro: 'Baltimore-Columbia-Towson' },
    { city: 'St. Louis', state: 'MO', metro: 'St. Louis' },
    { city: 'Charlotte', state: 'NC', metro: 'Charlotte-Concord-Gastonia' },
    { city: 'Orlando', state: 'FL', metro: 'Orlando-Kissimmee-Sanford' },
    { city: 'San Antonio', state: 'TX', metro: 'San Antonio-New Braunfels' },
    { city: 'Portland', state: 'OR', metro: 'Portland-Vancouver-Hillsboro' },
    { city: 'Sacramento', state: 'CA', metro: 'Sacramento-Roseville-Folsom' },
    { city: 'Pittsburgh', state: 'PA', metro: 'Pittsburgh' },
    { city: 'Las Vegas', state: 'NV', metro: 'Las Vegas-Henderson-Paradise' },
    { city: 'Austin', state: 'TX', metro: 'Austin-Round Rock-Georgetown' },
    { city: 'Cincinnati', state: 'OH', metro: 'Cincinnati' },
    { city: 'Kansas City', state: 'MO', metro: 'Kansas City' },
    { city: 'Columbus', state: 'OH', metro: 'Columbus' },
    { city: 'Indianapolis', state: 'IN', metro: 'Indianapolis-Carmel-Anderson' },
    { city: 'Cleveland', state: 'OH', metro: 'Cleveland-Elyria' },
    { city: 'San Jose', state: 'CA', metro: 'San Jose-Sunnyvale-Santa Clara' },
    { city: 'Nashville', state: 'TN', metro: 'Nashville-Davidson-Murfreesboro-Franklin' },
    { city: 'Virginia Beach', state: 'VA', metro: 'Virginia Beach-Norfolk-Newport News' },
    { city: 'Providence', state: 'RI', metro: 'Providence-Warwick' },
    { city: 'Milwaukee', state: 'WI', metro: 'Milwaukee-Waukesha' },
    { city: 'Jacksonville', state: 'FL', metro: 'Jacksonville' },
    { city: 'Oklahoma City', state: 'OK', metro: 'Oklahoma City' },
    { city: 'Raleigh', state: 'NC', metro: 'Raleigh-Cary' },
    { city: 'Memphis', state: 'TN', metro: 'Memphis' },
    { city: 'Richmond', state: 'VA', metro: 'Richmond' },
    { city: 'Louisville', state: 'KY', metro: 'Louisville/Jefferson County' },
    { city: 'New Orleans', state: 'LA', metro: 'New Orleans-Metairie' },
    { city: 'Salt Lake City', state: 'UT', metro: 'Salt Lake City' },
    { city: 'Hartford', state: 'CT', metro: 'Hartford-East Hartford-Middletown' },
    { city: 'Buffalo', state: 'NY', metro: 'Buffalo-Cheektowaga' },
    { city: 'Birmingham', state: 'AL', metro: 'Birmingham-Hoover' },
];

export function normalizeVertical(vertical: string): string {
    const clean = vertical.trim().toLowerCase();
    if (clean === 'restaurants') return 'restaurant';
    if (clean === 'med spas' || clean === 'medspa' || clean === 'medical spa') return 'med-spa';
    if (clean === 'law' || clean === 'law-firm' || clean === 'law firm') return 'legal';
    return clean;
}
