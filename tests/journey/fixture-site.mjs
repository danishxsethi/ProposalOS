/**
 * tests/journey/fixture-site.mjs
 *
 * Controlled audit-target fixture website for the joined journey.
 *
 * Serves a realistic small-business site ("Summit Ridge Heating & Air", Denver)
 * on loopback with DELIBERATE, DETECTABLE conditions and POSITIVE CONTROLS:
 *
 * Deliberate issues (must produce findings):
 *   - SEO: homepage has no meta description; /services has no <title>;
 *     no LocalBusiness/FAQ structured data anywhere; /about is thin content.
 *   - Accessibility: homepage hero image missing alt text; /contact form input
 *     has no associated label; low-contrast text block on /services.
 *   - Conversion: phone number rendered as plain text (no tel: link) sitewide;
 *     /services has no call-to-action.
 *   - Performance: ~1.6 MB unoptimized hero image served with no-store caching
 *     plus a deliberate 600 ms delay and a render-blocking inline script.
 *
 * Positive controls (must NOT produce findings):
 *   - Homepage has a proper <title> and exactly one <h1>.
 *   - Content images carry alt text.
 *   - robots.txt allows all crawling; viewport meta present.
 *   - NAP (name/address/phone) consistent in every footer; contact email public.
 *   - /privacy-policy is complete with contact info and user-rights language.
 *   - /competitor-site is a deliberately strong competitor page (title, meta
 *     description, LocalBusiness JSON-LD, tel: link, alt texts) used by the
 *     competitorStrategy module.
 *
 * Everything binds 127.0.0.1 only. This file is test harness code — it is never
 * imported by the application.
 */
import http from 'node:http';

const HOST = '127.0.0.1';

export const BUSINESS = {
  name: 'Summit Ridge Heating & Air',
  city: 'Denver',
  industry: 'HVAC',
  phone: '(303) 555-0148',
  email: 'hello@summitridge-fixture.test',
  address: '4120 Willow Street, Denver, CO 80207',
};

async function buildHeroImage() {
  // ~2.5MB high-entropy JPEG so Lighthouse measures a genuinely heavy
  // Largest Contentful Paint (deliberate performance issue).
  try {
    const { default: sharp } = await import('sharp');
    const width = 2200;
    const height = 1400;
    const rows = [];
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(width * 3);
      for (let x = 0; x < width; x += 2) {
        row[x * 3] = 30 + (Math.random() * 220 | 0);
        row[x * 3 + 1] = 30 + (Math.random() * 220 | 0);
        row[x * 3 + 2] = 30 + (Math.random() * 220 | 0);
        if (x + 1 < width) {
          row[(x + 1) * 3] = row[x * 3];
          row[(x + 1) * 3 + 1] = row[x * 3 + 1];
          row[(x + 1) * 3 + 2] = row[x * 3 + 2];
        }
      }
      rows.push(row);
    }
    return await sharp(Buffer.concat(rows), { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return Buffer.from(
      'Not a real image — fallback when sharp is unavailable (perf finding fidelity reduced)',
      'utf8'
    );
  }
}

function layout({ title, metaDescription, bodyClass, content, includeH1 = true }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${title === null ? '' : `<title>${title}</title>`}
  ${metaDescription ? `<meta name="description" content="${metaDescription}">` : ''}
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #222; }
    header { background: #173f5f; color: #fff; padding: 14px 24px; }
    header a { color: #fff; text-decoration: none; margin-right: 16px; }
    main { padding: 24px; max-width: 960px; }
    footer { border-top: 1px solid #ccc; margin-top: 32px; padding: 16px 24px; font-size: 14px; }
    .low-contrast { color: #b9bdc2; background: #ffffff; padding: 12px; }
    img.hero { width: 100%; height: auto; }
    form input { display: block; margin: 8px 0; padding: 8px; }
  </style>
  <script>
    // Deliberate render-blocking inline script (performance issue).
    window.__fixtureRenderBlocker = new Array(400000).fill('x').join('');
  </script>
</head>
<body class="${bodyClass}">
  <header>
    <a href="/">Summit Ridge Heating & Air</a>
    <a href="/services">Services</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </header>
  <main>
${includeH1 ? '<h1>Denver Heating and Air Conditioning Repair</h1>' : ''}
${content}
  </main>
  <footer>
    <p>Summit Ridge Heating & Air — ${BUSINESS.address}</p>
    <p>Phone: ${BUSINESS.phone} &nbsp;|&nbsp; Email: <a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a></p>
    <p>
      <a href="https://www.facebook.com/summitridgefixture">Facebook</a> |
      <a href="https://www.instagram.com/summitridgefixture">Instagram</a>
    </p>
    <p>&copy; 2026 Summit Ridge Heating & Air. All rights reserved.</p>
  </footer>
</body>
</html>`;
}

const pages = {
  '/': () =>
    layout({
      title: 'Summit Ridge Heating & Air | Denver HVAC Services',
      metaDescription: null,
      bodyClass: 'home',
      content: `
  <p>Fast, friendly furnace and AC service across the Denver metro area. Our licensed
  technicians repair, install, and maintain all major heating and cooling brands with
  upfront pricing and a two-year labor warranty.</p>
  <img class="hero" src="/hero.jpg" alt="Summit Ridge technician servicing a furnace">
  <img src="/badge.png" alt="NATE-certified technicians">
  <img src="/truck.png">
  <h2>Our Services</h2>
  <ul>
    <li>Furnace repair and replacement</li>
    <li>Central AC installation</li>
    <li>Seasonal maintenance plans</li>
    <li>Indoor air quality upgrades</li>
  </ul>
  <h2>Why Denver Chooses Summit Ridge</h2>
  <p>We answer the phone live in season, arrive inside agreed appointment windows, and
  quote before we start work. Thousands of Denver families have trusted our crews since
  2011 — including emergency no-heat calls on the coldest nights of the year.</p>`,
    }),

  '/services': () =>
    layout({
      title: null,
      metaDescription: null,
      bodyClass: 'services',
      includeH1: false,
      content: `
  <h4>Heating</h4>
  <p>Furnace tune-ups, heat pump service, ignition and blower repairs.</p>
  <h4>Cooling</h4>
  <p>AC recharge, capacitor and contactor replacement, full system swaps.</p>
  <h4>Maintenance</h4>
  <p>Twice-yearly plan visits that keep warranties valid.</p>
  <p class="low-contrast">We service all of Denver and the near suburbs, including Aurora,
  Lakewood, and Arvada. Same-week scheduling is common in shoulder season.</p>`,
    }),

  '/about': () =>
    layout({
      title: 'About Summit Ridge Heating & Air',
      metaDescription: null,
      bodyClass: 'about',
      includeH1: false,
      content: `
  <p>Family-owned since 2011. We like fixing things.</p>`,
    }),

  '/contact': () =>
    layout({
      title: 'Contact Summit Ridge Heating & Air',
      metaDescription: 'Call or email Summit Ridge Heating & Air in Denver for a fast HVAC quote.',
      bodyClass: 'contact',
      includeH1: false,
      content: `
  <h2>Get in Touch</h2>
  <p>Call ${BUSINESS.phone} or email ${BUSINESS.email}. Office hours are 7am-6pm weekdays.</p>
  <form action="/contact" method="post">
    <input type="text" name="name">
    <input type="text" name="phone">
    <button type="submit">Send</button>
  </form>`,
    }),

  '/privacy-policy': () =>
    layout({
      title: 'Privacy Policy — Summit Ridge Heating & Air',
      metaDescription: 'How Summit Ridge Heating & Air collects, uses, and protects your information.',
      bodyClass: 'privacy',
      includeH1: false,
      content: `
  <h2>Privacy Policy</h2>
  <p>Effective date: January 1, 2026.</p>
  <p>We collect only the information needed to schedule and perform service visits:
  your name, contact details, address, and equipment notes. We never sell personal
  information.</p>
  <h3>Your Rights</h3>
  <p>You have the right to access your data, request corrections, and ask us to
  delete your records. To exercise any of these rights, email ${BUSINESS.email} or call
  ${BUSINESS.phone}.</p>
  <h3>How We Protect Data</h3>
  <p>Records are stored on encrypted systems and retained for the shorter of the
  warranty period or two years after your last visit.</p>
  <h3>Contact</h3>
  <p>Summit Ridge Heating & Air, ${BUSINESS.address}, ${BUSINESS.phone}, ${BUSINESS.email}.</p>`,
    }),

  '/competitor-site': () =>
    layout({
      title: 'Alpine Peak HVAC Denver — Same-Day Furnace & AC Repair',
      metaDescription:
        'Alpine Peak HVAC: Denver furnace repair and AC installation with same-day slots and 4.9-star reviews.',
      bodyClass: 'competitor',
      includeH1: false,
      content: `
  <h1>Denver HVAC Repair Done Right, Same Day</h1>
  <p>Rated 4.9 stars from 612 Denver homeowners. Book online in under a minute or call
  <a href="tel:+13035550166">(303) 555-0166</a> — live dispatch 24/7 in winter.</p>
  <img src="/badge.png" alt="Alpine Peak service van in Denver">
  <a class="cta" href="/book">Book a Same-Day Visit</a>
  <h2>What We Fix</h2>
  <p>Furnaces, heat pumps, and central air from every major brand — including emergency
  no-heat and no-AC calls. Every repair backed by a written quote before work starts.</p>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "HVACBusiness",
    "name": "Alpine Peak HVAC",
    "telephone": "+13035550166",
    "address": { "@type": "PostalAddress", "addressLocality": "Denver", "addressRegion": "CO" }
  }
  </script>`,
    }),
};

export function startFixtureSite(port = 0) {
  let heroImage = null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('User-agent: *\nAllow: /\n');
        return;
      }
      if (path === '/hero.jpg') {
        if (!heroImage) heroImage = await buildHeroImage();
        // Deliberate perf issues: heavy payload, artificial delay, no caching.
        await new Promise((resolve) => setTimeout(resolve, 600));
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': heroImage.length,
          'Cache-Control': 'no-store',
        });
        res.end(heroImage);
        return;
      }
      if (path === '/badge.png' || path === '/truck.png') {
        // Small solid PNG (1x1 is enough — used for alt/label checks).
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'
        );
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(png);
        return;
      }
      const page = pages[path];
      if (page) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page());
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>404 — page not found</h1></body></html>');
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`fixture-site error: ${error.message}`);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, HOST, () => {
      const address = server.address();
      resolve({ server, port: address.port, url: `http://${HOST}:${address.port}` });
    });
  });
}

// Direct execution: node tests/journey/fixture-site.mjs [port]
if (process.argv[1] && process.argv[1].endsWith('fixture-site.mjs')) {
  const port = Number(process.argv[2] || process.env.FIXTURE_SITE_PORT || 0);
  const { url } = await startFixtureSite(port);
  console.log(JSON.stringify({ fixtureSiteUrl: url }));
}
