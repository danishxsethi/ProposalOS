'use client';

/**
 * Interactive API documentation page using Swagger UI.
 * Requirements: 9.5
 */

import { useEffect } from 'react';

export default function APIDocsPage() {
  useEffect(() => {
    // Dynamically load Swagger UI from CDN
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
    script.onload = () => {
      // @ts-expect-error SwaggerUIBundle loaded from CDN
      window.SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        presets: [
          // @ts-expect-error SwaggerUIBundle loaded from CDN
          window.SwaggerUIBundle.presets.apis,
          // @ts-expect-error SwaggerUIBundle loaded from CDN
          window.SwaggerUIBundle.SwaggerUIStandalonePreset,
        ],
        layout: 'BaseLayout',
        deepLinking: true,
        tryItOutEnabled: true,
      });
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900">Proposal Engine API</h1>
        <p className="mt-1 text-sm text-gray-500">
          REST API v1 — Integrate audits, proposals, outreach, and webhooks into your workflow.
        </p>
        <div className="mt-3 flex gap-3">
          <a
            href="/openapi.json"
            download="openapi.json"
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Download OpenAPI Spec
          </a>
          <a
            href="#sdks"
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            SDKs &amp; Examples
          </a>
        </div>
      </div>

      <div id="swagger-ui" className="px-4 py-6" />

      <div id="sdks" className="border-t border-gray-200 px-6 py-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">SDKs &amp; Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-2">JavaScript / TypeScript</h3>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-auto">
{`import { ProposalEngineClient } from '@proposal-engine/sdk';

const client = new ProposalEngineClient({
  apiKey: 'pe_pub_your_key_here',
});

const audit = await client.audits.create({
  businessName: 'Acme Dental',
  businessUrl: 'https://acmedental.com',
  city: 'Austin',
  industry: 'dental',
});

console.log(audit.id, audit.status);`}
            </pre>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-2">Python</h3>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-auto">
{`from proposal_engine import ProposalEngineClient

client = ProposalEngineClient(api_key="pe_pub_your_key_here")

audit = client.audits.create(
    business_name="Acme Dental",
    business_url="https://acmedental.com",
    city="Austin",
    industry="dental",
)

print(audit["id"], audit["status"])`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
