const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const SERVICE_URL = "https://proposal-engine-lzgezqezmq-uc.a.run.app";
const BUSINESS = process.argv[2] || "Joe's Plumbing";
const CITY = process.argv[3] || "Saskatoon";

// Helper to read .env.local
function getApiKey() {
    return "pe_dev_secret_key_change_me";
}

const API_KEY = getApiKey();

if (!API_KEY) {
    console.error("❌ API_KEY not found in .env.local or environment.");
    process.exit(1);
}

console.log("🚀 Verifying Production Service...");
console.log(`📍 Target: ${SERVICE_URL}`);
console.log(`🏢 Business: ${BUSINESS}, ${CITY}`);

try {
    console.log("🔑 Getting Identity Token...");
    const token = execSync('gcloud auth print-identity-token', { encoding: 'utf8' }).trim();

    if (!token) {
        console.error("❌ Failed to get identity token.");
        process.exit(1);
    }

    const payload = JSON.stringify({
        name: BUSINESS,
        city: CITY
    });

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,      // Cloud Run IAM Auth
            'x-api-key': API_KEY,                    // Application Auth
            'Content-Type': 'application/json',
            'Content-Length': payload.length
        }
    };

    console.log("⚡ Triggering Audit (this may take 30-60s)...");

    const req = https.request(`${SERVICE_URL}/api/audit`, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const json = JSON.parse(data);
                    if (json.id) {
                        console.log(`✅ Audit Started! ID: ${json.id}`);
                        console.log(`🔗 View Status: ${SERVICE_URL}/api/audit/${json.id}`);
                    } else {
                        console.log("⚠️ Audit started but no ID returned:", data);
                    }
                } catch (e) {
                    console.log("⚠️ Response not JSON:", data);
                }
            } else {
                console.error(`❌ Audit Failed! Status: ${res.statusCode}`);
                console.error("Response:", data);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`❌ Request Error: ${e.message}`);
    });

    req.write(payload);
    req.end();

} catch (e) {
    console.error("❌ Error:", e.message);
    process.exit(1);
}
