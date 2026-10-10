/**
 * tests/journey/fixture-providers.mjs
 *
 * Local fixture server for the EXTERNAL data providers the audit modules call
 * (SerpApi, Yelp/BBB/YellowPages direct scrapes, Google search). The Next.js
 * server's test-scoped fetch interception (instrumentation.ts) rewrites calls
 * to the allowlisted provider hosts to this server, so no request ever leaves
 * the VM. All responses are deterministic and derived from the configuration
 * passed at startup (business name, city, fixture site URL).
 *
 * Endpoints (path shape mirrors the original provider):
 *   /search.json            — SerpApi (engine=google_maps | google | yelp)
 *   /search                 — Yelp / BBB / YellowPages / Google HTML scrapes
 *
 * This file is test harness code — never imported by the application.
 */
import http from 'node:http';

const HOST = '127.0.0.1';

export function startFixtureProviders(config) {
  const { businessName, city, fixtureSiteUrl, competitorSiteUrl, placeId } = config;

  const googleReviews = [
    { rating: 1, date: '3 weeks ago', snippet: 'No heat for four days in January before anyone came out.', user: { name: 'Dana K.' } },
    { rating: 2, date: '2 months ago', snippet: 'Technician was fine but the office never returned my call about the estimate.', user: { name: 'Miguel R.' } },
    { rating: 5, date: '4 months ago', snippet: 'Great furnace install, tidy crew, fair price.', user: { name: 'Sofia K.' } },
    { rating: 4, date: '6 months ago', snippet: 'Quick AC recharge in July. Slightly late arrival.', user: { name: 'Tom W.' } },
    { rating: 3, date: '8 months ago', snippet: 'Decent maintenance visit but tried to upsell a new unit.', user: { name: 'Priya S.' } },
  ];

  const businessPlace = {
    place_id: placeId || 'ChIJfixture-summit-ridge-001',
    title: businessName,
    name: businessName,
    address: `4120 Willow Street, ${city}, CO 80207`,
    website: fixtureSiteUrl,
    phone: '(303) 555-0148',
    rating: 4.2,
    // Array form: the maps provider derives reviewCount from the array length
    // and the reputation module analyzes these real-looking review items.
    reviews: googleReviews,
    gps_coordinates: { latitude: 39.7692, longitude: -104.9559 },
    type: 'HVAC contractor',
    types: ['HVAC contractor', 'Heating contractor'],
    operating_hours: { monday: '07:00–18:00' },
    description: 'Family-owned Denver furnace and AC repair company since 2011.',
    thumbnail: `${fixtureSiteUrl}/badge.png`,
  };

  const competitorPlaces = [
    {
      place_id: 'ChIJfixture-alpine-peak-002',
      title: 'Alpine Peak HVAC',
      name: 'Alpine Peak HVAC',
      address: `2100 Kalamath Street, ${city}, CO 80223`,
      website: competitorSiteUrl,
      phone: '(303) 555-0166',
      rating: 4.9,
      reviews: 612,
      gps_coordinates: { latitude: 39.7231, longitude: -105.0 },
      type: 'HVAC contractor',
    },
    {
      place_id: 'ChIJfixture-metro-air-003',
      title: 'Metro Air Comfort',
      name: 'Metro Air Comfort',
      address: `8851 East Orchard Road, ${city}, CO 80111`,
      website: `${fixtureSiteUrl}/competitor-site?alt=metro`,
      phone: '(303) 555-0182',
      rating: 4.4,
      reviews: 188,
      gps_coordinates: { latitude: 39.6051, longitude: -104.8871 },
      type: 'HVAC contractor',
    },
  ];

  function serpGoogleMaps() {
    return {
      search_metadata: { status: 'Success', id: 'fixture_google_maps', json_url: fixtureSiteUrl },
      search_parameters: { engine: 'google_maps', q: `${businessName} ${city}` },
      local_results: [businessPlace, ...competitorPlaces],
    };
  }

  function serpGoogleLocal() {
    // google_local (competitor module) local_results carry numeric review
    // counts — the real SerpApi google_local shape.
    const numericPlace = { ...businessPlace, reviews: 57 };
    const numericCompetitors = competitorPlaces.map((c, i) => ({
      ...c,
      reviews: [612, 188][i] ?? 100,
    }));
    return {
      search_metadata: { status: 'Success', id: 'fixture_google_local', json_url: fixtureSiteUrl },
      search_parameters: { engine: 'google_local', q: `${businessName} ${city}` },
      local_results: [numericPlace, ...numericCompetitors],
    };
  }

  function serpGoogle(query) {
    // Social/profile discovery, keyword SERP checks, video presence, facebook
    // site: queries — all get deterministic organic results.
    const lower = query.toLowerCase();
    const organic = [];
    if (lower.includes('facebook.com')) {
      organic.push({
        title: `${businessName} - Home | Facebook`,
        link: `https://www.facebook.com/summitridgefixture`,
        snippet: `${businessName}, ${city}, CO. Furnace and AC repair. 4.2 stars.`,
      });
    } else if (lower.includes('instagram.com')) {
      organic.push({
        title: `${businessName} (@summitridgefixture) • Instagram photos and videos`,
        link: 'https://www.instagram.com/summitridgefixture',
      });
    } else if (lower.includes('youtube.com') || lower.includes(' video')) {
      organic.push({
        title: `${businessName} — Furnace Tune-Up Walkthrough - YouTube`,
        link: 'https://www.youtube.com/watch?v=fixture-hvac-1',
      });
    } else {
      organic.push({
        title: `${businessName} | ${city} HVAC Repair`,
        link: fixtureSiteUrl,
        snippet: `Furnace and AC repair in ${city}. Upfront pricing.`,
      });
      organic.push({
        title: `Best HVAC Companies in ${city} - 2026 List`,
        link: `https://www.example-${city.toLowerCase()}-directory.test/best-hvac`,
      });
    }
    return {
      search_metadata: { status: 'Success', id: 'fixture_google' },
      search_parameters: { engine: 'google', q: query },
      organic_results: organic,
    };
  }

  function serpYelp() {
    return {
      search_metadata: { status: 'Success', id: 'fixture_yelp' },
      search_parameters: { engine: 'yelp' },
      organic_results: [
        {
          title: businessName,
          link: 'https://www.yelp.com/biz/summit-ridge-heating-and-air-denver',
          rating: 4.0,
          reviews: 23,
        },
        {
          title: 'Alpine Peak HVAC',
          link: 'https://www.yelp.com/biz/alpine-peak-hvac-denver',
          rating: 4.5,
          reviews: 140,
        },
      ],
    };
  }

  function yelpSearchHtml() {
    return `<!doctype html><html><body>
      <div class="businessName">${businessName}</div>
      <span class="rating" aria-label="4.0 star rating">4.0</span>
      <span class="reviewCount">23 reviews</span>
      <a href="/biz/summit-ridge-heating-and-air-denver">Summit Ridge</a>
    </body></html>`;
  }

  function emptyDirectoryHtml() {
    // BBB / YellowPages scrapes parse for link lists; zero matches means the
    // directory simply reports the business as absent (a real, honest finding).
    return '<!doctype html><html><body><div class="search-results"></div></body></html>';
  }

  function googleHtml() {
    return `<!doctype html><html><body>
      <div id="search"><a href="${fixtureSiteUrl}">${businessName} | ${city} HVAC Repair</a></div>
    </body></html>`;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const query = (url.searchParams.get('q') || url.searchParams.get('find_desc') || '').trim();
    const engine = url.searchParams.get('engine') || '';

    try {
      if (path === '/search.json' || (path === '/search' && engine)) {
        // SerpApi calls: engine=google_maps | google_local | google | yelp.
        // (The competitor module fetches /search without the .json suffix.)
        // Real-shape note: google_maps results may carry review items (array),
        // while google_local local_results carry a numeric review count.
        let body;
        if (engine === 'google_maps') {
          body = serpGoogleMaps();
        } else if (engine === 'google_local') {
          body = serpGoogleLocal();
        } else if (engine === 'yelp') body = serpYelp();
        else body = serpGoogle(query || `${businessName} ${city}`);
        res.writeHead(200, { 'Content-Type': 'application/json', 'x-fixture-provider': 'serpapi' });
        res.end(JSON.stringify(body));
        return;
      }

      if (path === '/search' || path.startsWith('/search')) {
        // Directory scrapes (Yelp/BBB/YellowPages HTML) carry no engine param.
        res.writeHead(200, { 'Content-Type': 'text/html', 'x-fixture-provider': 'directory' });
        res.end(yelpSearchHtml());
        return;
      }

      if (path === '/' || path === '/maps') {
        res.writeHead(200, { 'Content-Type': 'text/html', 'x-fixture-provider': 'google' });
        res.end(googleHtml());
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'fixture provider: unknown path', path }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`fixture-providers error: ${error.message}`);
    }
  });

  return new Promise((resolve) => {
    server.listen(0, HOST, () => {
      const address = server.address();
      resolve({ server, port: address.port, url: `http://${HOST}:${address.port}` });
    });
  });
}

// Direct execution: node tests/journey/fixture-providers.mjs
if (process.argv[1] && process.argv[1].endsWith('fixture-providers.mjs')) {
  const { url } = await startFixtureProviders({
    businessName: process.env.FIXTURE_BUSINESS_NAME || 'Summit Ridge Heating & Air',
    city: process.env.FIXTURE_BUSINESS_CITY || 'Denver',
    fixtureSiteUrl: process.env.FIXTURE_SITE_URL || 'http://127.0.0.1:8788',
    competitorSiteUrl: `${process.env.FIXTURE_SITE_URL || 'http://127.0.0.1:8788'}/competitor-site`,
  });
  console.log(JSON.stringify({ fixtureProvidersUrl: url }));
}
