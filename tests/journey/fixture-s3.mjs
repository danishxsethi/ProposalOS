/**
 * tests/journey/fixture-s3.mjs
 *
 * Minimal local S3-compatible object store for the joined journey.
 *
 * The application's real storage layer (lib/storage.ts) uses the AWS SDK v3
 * S3Client unchanged; the test harness points the SDK at this loopback endpoint
 * via the standard AWS_ENDPOINT_URL environment variable. This server accepts
 * the object operations the product performs (PutObject/GetObject + presigned
 * GET redirects) and stores bytes in memory. It performs NO authentication and
 * binds 127.0.0.1 only — it is test harness code, never imported by the app,
 * and never reachable off-host.
 *
 * Supported:
 *   PUT  /<bucket>/<key>   — store bytes (ETag returned)
 *   GET  /<bucket>/<key>   — return bytes (query string ignored: presigned URLs
 *                            carry their signature in the query)
 *   HEAD /<bucket>/<key>   — existence + content type
 */
import http from 'node:http';

const HOST = '127.0.0.1';

const MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.html': 'text/html',
  '.txt': 'text/plain',
};

export function startFixtureS3(port = 0) {
  const objects = new Map(); // key: `${bucket}/${key}` -> { body: Buffer, contentType: string }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const slash = path.indexOf('/');
    if (slash <= 0) {
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      res.end('<Error><Code>NoSuchBucket</Code></Error>');
      return;
    }
    const bucket = path.slice(0, slash);
    const key = path.slice(slash + 1);
    const storageKey = `${bucket}/${key}`;

    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const extension = key.slice(key.lastIndexOf('.')).toLowerCase();
        objects.set(storageKey, {
          body,
          contentType: req.headers['content-type'] || MIME_BY_EXTENSION[extension] || 'application/octet-stream',
        });
        const etag = `"${hash(body)}"`;
        res.writeHead(200, {
          ETag: etag,
          'x-amz-checksum-crc32': req.headers['x-amz-checksum-crc32'] || '',
          'Content-Length': '0',
        });
        res.end();
      });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const object = objects.get(storageKey);
      if (!object) {
        res.writeHead(404, { 'Content-Type': 'application/xml' });
        res.end('<Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      const headers = {
        'Content-Type': object.contentType,
        'Content-Length': String(object.body.length),
        ETag: `"${hash(object.body)}"`,
        'Cache-Control': 'private, no-store',
      };
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end();
      else res.end(object.body);
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/xml' });
    res.end('<Error><Code>MethodNotAllowed</Code></Error>');
  });

  function hash(buffer) {
    let value = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
      value ^= buffer[i];
      value = Math.imul(value, 0x00a153a5) >>> 0;
    }
    return (value ^ 0xffffffff).toString(16);
  }

  return new Promise((resolve) => {
    server.listen(port, HOST, () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        url: `http://${HOST}:${address.port}`,
        /** Test accessor: list stored object keys (for evidence capture). */
        listObjects: () => Array.from(objects.keys()),
        getObject: (k) => objects.get(k),
      });
    });
  });
}

// Direct execution: node tests/journey/fixture-s3.mjs [port]
if (process.argv[1] && process.argv[1].endsWith('fixture-s3.mjs')) {
  const { url } = await startFixtureS3(Number(process.argv[2] || 0));
  console.log(JSON.stringify({ fixtureS3Url: url }));
}
