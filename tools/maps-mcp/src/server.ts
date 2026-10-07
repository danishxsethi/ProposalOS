import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { stderr, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';

import { SerpApiMapsProvider } from '../../../lib/maps/serpMapsProvider';

import type { MapsResult } from '../../../lib/maps/types';

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<MapsResult<unknown>>;
};

const provider = new SerpApiMapsProvider({
  enableGeocoding: process.env.MAPS_MCP_ENABLE_GEOCODING === 'true',
  enableRoutes: process.env.MAPS_MCP_ENABLE_ROUTES === 'true',
});

function stringArg(
  input: Record<string, unknown>,
  key: string,
  max: number,
  required = true
): string | undefined {
  const value = input[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max)
    throw new Error(`Invalid ${key}`);
  return value.trim();
}

function numberArg(input: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`Invalid ${key}`);
  return value;
}

const tools: Tool[] = [
  {
    name: 'maps_resolve_business',
    description:
      'Resolve a real-world business identity; ambiguous identities remain explicitly ambiguous.',
    inputSchema: {
      type: 'object',
      required: ['businessName', 'city'],
      properties: {
        businessName: { type: 'string', maxLength: 200 },
        city: { type: 'string', maxLength: 160 },
        address: { type: 'string', maxLength: 300 },
        domain: { type: 'string', maxLength: 253 },
        phone: { type: 'string', maxLength: 40 },
        latitude: { type: 'number', minimum: -90, maximum: 90 },
        longitude: { type: 'number', minimum: -180, maximum: 180 },
        placeId: { type: 'string', maxLength: 256 },
      },
      additionalProperties: false,
    },
    handler: (input) =>
      provider.resolveBusiness({
        businessName: stringArg(input, 'businessName', 200)!,
        city: stringArg(input, 'city', 160)!,
        address: stringArg(input, 'address', 300, false),
        domain: stringArg(input, 'domain', 253, false),
        phone: stringArg(input, 'phone', 40, false),
        latitude: input.latitude === undefined ? undefined : numberArg(input, 'latitude', -90, 90),
        longitude:
          input.longitude === undefined ? undefined : numberArg(input, 'longitude', -180, 180),
        placeId: stringArg(input, 'placeId', 256, false),
        fieldProfile: 'IDENTITY_MINIMAL',
      }),
  },
  {
    name: 'maps_search_places',
    description: 'Read-only Places Text Search with a bounded result set.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', maxLength: 240 },
        city: { type: 'string', maxLength: 160 },
        region: { type: 'string', maxLength: 100 },
        maxResults: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
    handler: (input) =>
      provider.searchText({
        query: stringArg(input, 'query', 240)!,
        city: stringArg(input, 'city', 160, false),
        region: stringArg(input, 'region', 100, false),
        maxResults:
          input.maxResults === undefined ? undefined : numberArg(input, 'maxResults', 1, 20),
        fieldProfile: 'IDENTITY_MINIMAL',
      }),
  },
  {
    name: 'maps_search_nearby',
    description: 'Read-only nearby search bounded to a 50km radius and 20 results.',
    inputSchema: {
      type: 'object',
      required: ['latitude', 'longitude', 'radiusMeters'],
      properties: {
        latitude: { type: 'number', minimum: -90, maximum: 90 },
        longitude: { type: 'number', minimum: -180, maximum: 180 },
        radiusMeters: { type: 'number', minimum: 1, maximum: 50000 },
        includedTypes: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 } },
        maxResults: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
    handler: (input) =>
      provider.searchNearby({
        latitude: numberArg(input, 'latitude', -90, 90),
        longitude: numberArg(input, 'longitude', -180, 180),
        radiusMeters: numberArg(input, 'radiusMeters', 1, 50_000),
        includedTypes:
          Array.isArray(input.includedTypes) &&
          input.includedTypes.every((v) => typeof v === 'string' && v.length <= 100)
            ? (input.includedTypes as string[])
            : undefined,
        maxResults:
          input.maxResults === undefined ? undefined : numberArg(input, 'maxResults', 1, 20),
        fieldProfile: 'IDENTITY_MINIMAL',
      }),
  },
  {
    name: 'maps_get_place',
    description: 'Get normalized identity details for a fixed Place ID.',
    inputSchema: {
      type: 'object',
      required: ['placeId'],
      properties: { placeId: { type: 'string', maxLength: 256 } },
      additionalProperties: false,
    },
    handler: async (input) => {
      const result = await provider.getPlace(stringArg(input, 'placeId', 256)!, 'IDENTITY_MINIMAL');
      if (result.status === 'COMPLETE' && result.data)
        result.data = { ...result.data, providerAttributions: result.data.providerAttributions };
      return result;
    },
  },
  {
    name: 'maps_geocode',
    description: 'Geocode an address if the optional capability is enabled.',
    inputSchema: {
      type: 'object',
      required: ['address'],
      properties: {
        address: { type: 'string', maxLength: 300 },
        languageCode: { type: 'string', maxLength: 16 },
        regionCode: { type: 'string', maxLength: 4 },
      },
      additionalProperties: false,
    },
    handler: (input) =>
      provider.geocode({
        address: stringArg(input, 'address', 300)!,
        languageCode: stringArg(input, 'languageCode', 16, false),
        regionCode: stringArg(input, 'regionCode', 4, false),
      }),
  },
  {
    name: 'maps_reverse_geocode',
    description: 'Reverse geocode coordinates if the optional capability is enabled.',
    inputSchema: {
      type: 'object',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: { type: 'number', minimum: -90, maximum: 90 },
        longitude: { type: 'number', minimum: -180, maximum: 180 },
      },
      additionalProperties: false,
    },
    handler: (input) =>
      provider.reverseGeocode(
        numberArg(input, 'latitude', -90, 90),
        numberArg(input, 'longitude', -180, 180)
      ),
  },
  {
    name: 'maps_route_matrix',
    description: 'Read-only bounded route matrix (maximum 100 coordinate pairs).',
    inputSchema: {
      type: 'object',
      required: ['origins', 'destinations'],
      properties: {
        origins: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: {
            type: 'object',
            required: ['latitude', 'longitude'],
            properties: {
              latitude: { type: 'number', minimum: -90, maximum: 90 },
              longitude: { type: 'number', minimum: -180, maximum: 180 },
            },
            additionalProperties: false,
          },
        },
        destinations: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: {
            type: 'object',
            required: ['latitude', 'longitude'],
            properties: {
              latitude: { type: 'number', minimum: -90, maximum: 90 },
              longitude: { type: 'number', minimum: -180, maximum: 180 },
            },
            additionalProperties: false,
          },
        },
        travelMode: { type: 'string', enum: ['DRIVE', 'WALK', 'BICYCLE', 'TRANSIT'] },
      },
      additionalProperties: false,
    },
    handler: (input) => {
      const points = (key: 'origins' | 'destinations') => {
        const value = input[key];
        if (!Array.isArray(value) || value.length < 1 || value.length > 10)
          throw new Error(`Invalid ${key}`);
        return value.map((point) => {
          if (!point || typeof point !== 'object') throw new Error(`Invalid ${key} point`);
          const p = point as Record<string, unknown>;
          return {
            latitude: numberArg(p, 'latitude', -90, 90),
            longitude: numberArg(p, 'longitude', -180, 180),
          };
        });
      };
      const travelMode = input.travelMode;
      if (
        travelMode !== undefined &&
        !['DRIVE', 'WALK', 'BICYCLE', 'TRANSIT'].includes(String(travelMode))
      )
        throw new Error('Invalid travelMode');
      return provider.routeMatrix({
        origins: points('origins'),
        destinations: points('destinations'),
        travelMode: travelMode as 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT' | undefined,
      });
    },
  },
];

function jsonRpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

async function dispatch(message: Record<string, unknown>) {
  const id = message.id;
  const method = message.method;
  if (method === 'initialize')
    return jsonRpc(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'proposalos-maps-intelligence', version: '1.0.0' },
    });
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
  if (method === 'ping') return jsonRpc(id, {});
  if (method === 'tools/list')
    return jsonRpc(id, {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    });
  if (method === 'tools/call') {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const name = params.name;
    const tool = tools.find((entry) => entry.name === name);
    if (!tool) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown Maps tool' } };
    try {
      const result = await tool.handler((params.arguments ?? {}) as Record<string, unknown>);
      return jsonRpc(id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: result.status === 'FAILED',
      });
    } catch (error) {
      return jsonRpc(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'FAILED',
              error: error instanceof Error ? error.message : 'Invalid tool request',
            }),
          },
        ],
        isError: true,
      });
    }
  }
  if (method === 'resources/list') return jsonRpc(id, { resources: [] });
  if (method === 'prompts/list') return jsonRpc(id, { prompts: [] });
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

async function runStdio() {
  const lines = createInterface({ input: stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (Buffer.byteLength(line) > 32_768) {
      stderr.write('Rejected oversized MCP request\n');
      continue;
    }
    try {
      const message = JSON.parse(line) as Record<string, unknown>;
      const response = await dispatch(message);
      if (response) stdout.write(`${JSON.stringify(response)}\n`);
    } catch {
      stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`
      );
    }
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 32_768) throw new Error('Request body too large');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function handleHttp(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST' || request.url !== '/mcp') {
    response.writeHead(404).end();
    return;
  }
  const expected = process.env.MAPS_MCP_BEARER_TOKEN;
  if (!expected || request.headers.authorization !== `Bearer ${expected}`) {
    response.writeHead(401).end();
    return;
  }
  try {
    const message = await readBody(request);
    const result = await dispatch(message);
    response
      .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(result));
  } catch {
    response
      .writeHead(400, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'Invalid or oversized MCP request' }));
  }
}

export async function runMapsMcp() {
  if (!process.env.SERP_API_KEY) throw new Error('Maps MCP requires server-side SERP_API_KEY');
  if (process.env.MAPS_MCP_HTTP_ENABLED === 'true') {
    const server = createServer((request, response) => {
      void handleHttp(request, response);
    });
    const host = process.env.MAPS_MCP_HTTP_HOST ?? '127.0.0.1';
    const port = Number(process.env.MAPS_MCP_HTTP_PORT ?? 8788);
    server.listen(port, host, () => stderr.write(`Maps MCP listening on ${host}:${port}\n`));
    return;
  }
  await runStdio();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMapsMcp().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Maps MCP failed';
    stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
