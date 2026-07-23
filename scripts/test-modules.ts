import { runWebsiteModule } from '../lib/modules/website';
import { runGBPModule } from '../lib/modules/gbp';
import { runCompetitorModule } from '../lib/modules/competitor';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

async function main() {
    const target = {
        businessName: "Joe's Plumbing",
        city: "Saskatoon",
        url: "https://joesplumbingsaskatoon.com", // Fictional, might fail or return 404
        keyword: "plumber"
    };

    console.log("--- Starting Module Tests ---");
    console.log("Target:", target);

    // 1. Competitor Module (Uses SerpAPI - Key Provided)
    console.log("\n1. Testing Competitor Module...");
    if (process.env.SERP_API_KEY) {
        const competitorResult = await runCompetitorModule({
            keyword: target.keyword,
            location: target.city
        });
        console.log("Result:", JSON.stringify(competitorResult, null, 2));
    } else {
        console.log("SKIPPED: SERP_API_KEY missing");
    }

    // 2. Website Module (Uses PSI API - Key Missing)
    console.log("\n2. Testing Website Module...");
    if (process.env.GOOGLE_PAGESPEED_API_KEY) {
        const websiteResult = await runWebsiteModule({
            url: target.url
        });
        console.log("Result:", JSON.stringify(websiteResult, null, 2));
    } else {
        console.log("SKIPPED: GOOGLE_PAGESPEED_API_KEY missing");
    }

    // 3. GBP Module (Uses Places API - Key Missing)
    console.log("\n3. Testing GBP Module...");
    if (process.env.GOOGLE_PLACES_API_KEY) {
        const gbpResult = await runGBPModule({
            businessName: target.businessName,
            city: target.city
        });
        console.log("Result:", JSON.stringify(gbpResult, null, 2));
    } else {
        console.log("SKIPPED: GOOGLE_PLACES_API_KEY missing");
    }
}

main().catch(console.error);
