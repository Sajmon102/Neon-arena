const http = require('node:http');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { webcrypto } = require('node:crypto');

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 4096;
const MAX_ROOMS = 128;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

const rooms = new Map();

function memoryArenaStore() {
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) {
          params = values;
          return this;
        },
        async first() {
          if (sql.startsWith('SELECT code FROM arenas')) {
            const room = rooms.get(params[0]);
            return room ? { code: params[0] } : null;
          }
          if (sql.startsWith('SELECT state,revision FROM arenas')) {
            const room = rooms.get(params[0]);
            return room ? { state: room.state, revision: room.revision } : null;
          }
          throw new Error(`Unsupported memory query: ${sql}`);
        },
        async run() {
          if (sql.startsWith('DELETE FROM arenas')) {
            let changes = 0;
            for (const [code, room] of rooms) {
              if (room.updatedAt < params[0]) {
                rooms.delete(code);
                changes++;
              }
            }
            return { meta: { changes } };
          }
          if (sql.startsWith('INSERT INTO arenas')) {
            const [code, state, updatedAt] = params;
            if (!rooms.has(code) && rooms.size < MAX_ROOMS) {
              rooms.set(code, { state, revision: 0, updatedAt });
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (sql.startsWith('UPDATE arenas SET state')) {
            const [state, updatedAt, code, expectedRevision] = params;
            const room = rooms.get(code);
            if (!room || room.revision !== expectedRevision) return { meta: { changes: 0 } };
            rooms.set(code, { state, revision: room.revision + 1, updatedAt });
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unsupported memory command: ${sql}`);
        },
      };
    },
  };
}

const arenaStore = memoryArenaStore();

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function requestOrigin(request) {
  const protocol = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${protocol}://${request.headers.host}`;
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Żądanie jest zbyt duże.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    const error = new Error('Nieprawidłowe dane.');
    error.status = 400;
    throw error;
  }
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

async function serveStatic(request, response, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const pathname = url.pathname === '/' ? '/arena.html' : url.pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return true;
  }
  const filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return true;
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': decoded === '/arena.html' ? 'no-cache' : 'public, max-age=300',
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(data);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') response.writeHead(404).end('Not found');
    else throw error;
  }
  return true;
}

async function main() {
  const { handleArena, ArenaError } = await import('./server/arena-service.js');
  setInterval(() => {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of rooms) if (room.updatedAt < cutoff) rooms.delete(code);
  }, 60_000).unref();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, requestOrigin(request));
      if (url.pathname === '/health') return sendJson(response, 200, { ok: true, rooms: rooms.size });
      if (url.pathname === '/api/arena') {
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Dozwolone jest tylko żądanie POST.' });
        const origin = request.headers.origin;
        if (origin && origin !== requestOrigin(request)) return sendJson(response, 403, { error: 'Niedozwolone źródło żądania.' });
        const declaredLength = Number(request.headers['content-length']);
        if (declaredLength > MAX_BODY_BYTES) return sendJson(response, 413, { error: 'Żądanie jest zbyt duże.' });
        const body = await readJsonBody(request);
        const token = String(request.headers.authorization || '').replace(/^Bearer /, '');
        return sendJson(response, 200, await handleArena(arenaStore, body, token));
      }
      if (await serveStatic(request, response, url)) return;
      response.writeHead(405).end('Method not allowed');
    } catch (error) {
      if (error instanceof ArenaError || error.status) return sendJson(response, error.status || 400, { error: error.message });
      console.error('Request failed', error);
      sendJson(response, 503, { error: 'Arena online jest chwilowo niedostępna. Spróbuj ponownie; Solo działa bez połączenia.' });
    }
  });

  server.listen(PORT, HOST, () => console.log(`Neon Arena działa na porcie ${PORT}`));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
