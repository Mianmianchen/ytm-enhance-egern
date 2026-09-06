/* Candidate v2.5: narrow, lossless player edits. Encrypted UMP is unsupported.
 * Field numbers derived from Maasea/sgmodule (Apache-2.0).
 */
export const join = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
};
export function encode(n) {
  const bytes = [];
  do { const b = n % 128; n = Math.floor(n / 128); bytes.push(b | (n ? 128 : 0)); } while (n);
  return Uint8Array.from(bytes);
}
export const message = (n, body) => join(encode(n * 8 + 2), encode(body.length), body);
export function parse(bytes) {
  let at = 0;
  function read() {
    let n = 0n;
    for (let i = 0; i < 10; i++) {
      if (at >= bytes.length) throw Error('truncated varint');
      const b = bytes[at++];
      if (i === 9 && b > 1) throw Error('varint overflow');
      n |= BigInt(b & 127) << BigInt(i * 7);
      if (!(b & 128)) return n;
    }
    throw Error('invalid varint');
  }
  const result = [];
  while (at < bytes.length) {
    const start = at, tag = read();
    if (tag > 0xffffffffn || tag < 8n) throw Error('invalid tag');
    const no = Number(tag >> 3n), wire = Number(tag & 7n);
    let bodyStart = at;
    if (wire === 0) read();
    else if (wire === 1) at += 8;
    else if (wire === 5) at += 4;
    else if (wire === 2) {
      const length = read();
      if (length > BigInt(bytes.length - at)) throw Error('truncated message');
      bodyStart = at; at += Number(length);
    } else throw Error('unsupported group');
    if (at > bytes.length) throw Error('truncated fixed field');
    result.push({ no, wire, raw: bytes.subarray(start, at), body: bytes.subarray(bodyStart, at) });
  }
  return result;
}
// Edit only a known path; never decode strings, thumbnails or other renderers.
function setActive(body, path) {
  const [no, ...tail] = path;
  const out = []; let found = false;
  for (const f of parse(body)) {
    if (f.no !== no) { out.push(f.raw); continue; }
    found = true;
    if (f.wire !== (tail.length ? 2 : 0)) throw Error('background field type changed');
    out.push(tail.length ? message(no, setActive(f.body, tail)) : join(encode(no * 8), encode(1)));
  }
  if (!found) out.push(tail.length ? message(no, setActive(new Uint8Array(), tail)) : join(encode(no * 8), encode(1)));
  return join(...out);
}
export function player(body) {
  return join(...parse(body).flatMap(f => {
    if ((f.no === 7 || f.no === 68) && f.wire === 2) return [];
    if (f.no === 2 && f.wire === 2) return [message(2, setActive(f.body, [11, 64657230, 1]))];
    return [f.raw];
  }));
}
export function watch(body) {
  return join(...parse(body).map(f => f.no === 1 && f.wire === 2
    ? message(1, join(...parse(f.body).map(c => c.no === 2 && c.wire === 2 ? message(2, player(c.body)) : c.raw)))
    : f.raw));
}
export function jsonPlayer(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || !p.playabilityStatus) return;
  delete p.adPlacements; delete p.adSlots; delete p.playerAds;
  const status = p.playabilityStatus;
  const render = status.backgroundPlayerRenderer ?? status.backgroundPlayerRender;
  if (!render) return;
  const ability = render.backgroundPlayerSupportedRenderer ?? render.backgroundAbility;
  if (!ability) return;
  ability.active = true;
  if ('backgroundAbility' in render) render.backgroundAbility = ability;
  else render.backgroundPlayerSupportedRenderer = ability;
  if ('backgroundPlayerRender' in status) status.backgroundPlayerRender = render;
  else status.backgroundPlayerRenderer = render;
}
async function ordinaryResponse(ctx) {
  const endpoint = new URL(ctx.request.url).pathname.split('/').pop();
  if (!['player', 'get_watch'].includes(endpoint) || ctx.response.status !== 200) return;
  try {
    let body = new Uint8Array(await ctx.response.arrayBuffer());
    const coding = (ctx.response.headers.get('content-encoding') ?? '').toLowerCase();
    const decompress = { gzip: 'gunzip', br: 'unbrotli', deflate: 'inflate' }[coding];
    if (coding && !decompress) return;
    if (decompress) {
      const decoded = await ctx.compress[decompress](body);
      if (!decoded) return;
      body = decoded;
    }
    let output;
    const type = ctx.response.headers.get('content-type') ?? '';
    if (type.includes('json')) {
      const data = JSON.parse(new TextDecoder().decode(body));
      if (endpoint === 'player') jsonPlayer(data);
      else if (Array.isArray(data.contents)) {
        for (const c of data.contents) if (c.player) jsonPlayer(c.player);
      }
      output = new TextEncoder().encode(JSON.stringify(data));
    } else output = endpoint === 'player' ? player(body) : watch(body);
    if (output.length === body.length && output.every((b, i) => b === body[i])) return;
    const headers = ctx.response.headers;
    headers.delete('content-encoding'); headers.delete('content-length');
    return { headers, body: output };
  } catch (e) { console.log('YTM candidate passthrough: ' + String(e)); }
}

const KEY = 'ytm-v25-onesie';
function nested(body, path) {
  for (const no of path) {
    const f = parse(body).find(f => f.no === no && f.wire === 2);
    if (!f) return;
    body = f.body;
  }
  return body;
}
const base64 = bytes => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let text = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    text += alphabet[n >>> 18] + alphabet[(n >>> 12) & 63]
      + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=')
      + (i + 2 < bytes.length ? alphabet[n & 63] : '=');
  }
  return text;
};
async function decoded(ctx, response) {
  let body = new Uint8Array(await response.arrayBuffer());
  const coding = response.headers.get('content-encoding');
  if (!coding || coding === 'identity') return body;
  const method = {gzip:'gunzip', br:'unbrotli', deflate:'inflate'}[coding.toLowerCase()];
  if (!method) throw Error('unsupported encoding');
  body = await ctx.compress[method](body);
  if (!body) throw Error('decompression failed');
  return body;
}
async function captureKey(ctx) {
  if (ctx.response.status !== 200) return;
  const body = await decoded(ctx, ctx.response);
  const hot = nested(body, [1,16,7,138536474,146311580]);
  if (!hot) return;
  const f = parse(hot);
  const client = f.find(x => x.no === 1 && x.wire === 2)?.body;
  const encrypted = f.find(x => x.no === 2 && x.wire === 2)?.body;
  if (!client?.length || !encrypted?.length) return;
  // The server supplies key lifetime as an int64 varint. Never retain indefinitely.
  const ttlBytes = f.find(x => x.no === 3 && x.wire === 0)?.body;
  let ttl = 0;
  if (ttlBytes) for (let i = 0; i < ttlBytes.length; i++) ttl += (ttlBytes[i] & 127) * 2 ** (7 * i);
  if (!Number.isSafeInteger(ttl) || ttl <= 0) return;
  ctx.storage.set(KEY, JSON.stringify({client:base64(client), encrypted:base64(encrypted), expires:Date.now() + Math.min(ttl,86400) * 1000}));
}
async function initRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.pathname !== '/initplayback' || !url.searchParams.has('ack')) return;
  const config = JSON.parse(ctx.storage.get(KEY) || 'null');
  if (!config || config.expires <= Date.now()) return;
  const body = await decoded(ctx, ctx.request);
  const encrypted = nested(body,[3,5]);
  if (!encrypted || base64(encrypted) !== config.encrypted) return;
  const worker = 'https://init-stream.maasea.workers.dev/?target=' + encodeURIComponent(ctx.request.url)
    + '&ck=' + encodeURIComponent(config.client) + '&captionLang=off';
  // Explicit allowlist: do not forward Google account authorization or cookies.
  const headers = {};
  for (const key of ['content-type','user-agent','accept']) {
    const value = ctx.request.headers.get(key);
    if (value) headers[key] = value;
  }
  const method = ctx.request.method.toLowerCase();
  if (!['post','get'].includes(method)) return;
  const response = await ctx.http[method](worker, {
    headers, ...(method === 'post' ? {body} : {}),
    timeout: 8000, redirect:'manual', credentials:'omit'
  });
  if (response.status !== 200) return;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/vnd.yt-ump')) return;
  const result = await decoded(ctx,response);
  if (!result.length) return;
  // This path relies on the upstream Worker's UMP transformer, not player protobuf.
  return ctx.respond({status:200, headers:{'content-type':type}, body:result});
}
export default async function(ctx) {
  try {
    const path = new URL(ctx.request.url).pathname;
    if (!ctx.response) {
      if (path.endsWith('/log_event')) {
        const cached = JSON.parse(ctx.storage.get(KEY) || 'null');
        if (!cached || cached.expires <= Date.now()) {
          ctx.request.headers.delete('x-youtube-hot-hash-data');
          return {headers:ctx.request.headers};
        }
        return;
      }
      return await initRequest(ctx);
    }
    if (/\/(config|log_event)$/.test(path)) return await captureKey(ctx);
    return await ordinaryResponse(ctx);
  } catch (e) { console.log('YTM v2.5 passthrough: ' + String(e)); }
}
