/* YouTube Music Enhance v2.4 — surgical protobuf patch for Egern.
 * Keeps every unknown/player metadata field byte-for-byte while removing
 * playback ad fields and enabling background playback.
 */

const toHeaders = (headers) => {
  const out = {};
  if (!headers) return out;
  if (typeof headers.entries === "function") {
    for (const [key, value] of headers.entries()) out[key] = value;
  } else if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => { out[key] = value; });
  } else {
    Object.assign(out, headers);
  }
  return out;
};

const concat = (...parts) => {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const varint = (value) => {
  const bytes = [];
  let current = Number(value);
  while (current > 127) {
    bytes.push((current % 128) | 128);
    current = Math.floor(current / 128);
  }
  bytes.push(current);
  return Uint8Array.from(bytes);
};

const lengthField = (number, body) => concat(varint(number * 8 + 2), varint(body.length), body);

const readVarint = (bytes, start) => {
  let value = 0;
  let factor = 1;
  let offset = start;
  for (let count = 0; count < 10 && offset < bytes.length; count += 1) {
    const byte = bytes[offset++];
    value += (byte & 127) * factor;
    if ((byte & 128) === 0) return { value, offset };
    factor *= 128;
  }
  throw new Error("invalid protobuf varint");
};

const fields = (bytes) => {
  const result = [];
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset;
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const number = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    let bodyStart = offset;
    let bodyEnd = offset;
    if (wire === 0) {
      offset = readVarint(bytes, offset).offset;
      bodyEnd = offset;
    } else if (wire === 1) {
      offset += 8;
      bodyEnd = offset;
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      bodyStart = length.offset;
      bodyEnd = bodyStart + length.value;
      offset = bodyEnd;
    } else if (wire === 5) {
      offset += 4;
      bodyEnd = offset;
    } else {
      throw new Error(`unsupported protobuf wire type ${wire}`);
    }
    if (offset > bytes.length || number < 1) throw new Error("invalid protobuf field");
    result.push({ number, wire, raw: bytes.slice(start, offset), body: bytes.slice(bodyStart, bodyEnd) });
  }
  return result;
};

const rebuild = (items) => concat(...items);

// BackgroundSupportedRenderer.backgroundAbility.active = true
const backgroundAbility = lengthField(64657230, Uint8Array.of(8, 1));
const backgroundRenderer = lengthField(11, backgroundAbility);

const patchPlayability = (body) => {
  const kept = fields(body).filter((field) => field.number !== 11).map((field) => field.raw);
  kept.push(backgroundRenderer);
  return rebuild(kept);
};

const patchTracking = (body) => rebuild(
  fields(body).filter((field) => field.number !== 18).map((field) => field.raw),
);

const patchPlayer = (body) => {
  const output = [];
  let changed = false;
  for (const field of fields(body)) {
    if (field.number === 7 || field.number === 68) {
      changed = true;
      continue;
    }
    if (field.number === 2 && field.wire === 2) {
      output.push(lengthField(2, patchPlayability(field.body)));
      changed = true;
    } else if (field.number === 9 && field.wire === 2) {
      output.push(lengthField(9, patchTracking(field.body)));
      changed = true;
    } else {
      output.push(field.raw);
    }
  }
  return { body: rebuild(output), changed };
};

const patchWatchContent = (body) => {
  const output = [];
  let changed = false;
  for (const field of fields(body)) {
    if (field.number === 2 && field.wire === 2) {
      const player = patchPlayer(field.body);
      output.push(lengthField(2, player.body));
      changed ||= player.changed;
    } else {
      output.push(field.raw);
    }
  }
  return { body: rebuild(output), changed };
};

const patchGetWatch = (body) => {
  const output = [];
  let changed = false;
  for (const field of fields(body)) {
    if (field.number === 1 && field.wire === 2) {
      const content = patchWatchContent(field.body);
      output.push(lengthField(1, content.body));
      changed ||= content.changed;
    } else {
      output.push(field.raw);
    }
  }
  return { body: rebuild(output), changed };
};

export default async function (ctx) {
  try {
    const originalHeaders = toHeaders(ctx.response.headers);
    const encoding = String(
      ctx.response.headers?.get?.("content-encoding")
      ?? originalHeaders["content-encoding"]
      ?? originalHeaders["Content-Encoding"]
      ?? "",
    ).toLowerCase();
    let body = new Uint8Array(await ctx.response.arrayBuffer());
    try {
      if (encoding.includes("gzip")) body = (await ctx.compress.gunzip(body)) ?? body;
      else if (encoding.includes("br")) body = (await ctx.compress.unbrotli(body)) ?? body;
      else if (encoding.includes("deflate")) body = (await ctx.compress.inflate(body)) ?? body;
    } catch (_) {
      // Egern can provide an already-decoded body while retaining the header.
    }

    const result = ctx.request.url.includes("/get_watch") ? patchGetWatch(body) : patchPlayer(body);
    if (!result.changed) return undefined;

    const headers = { ...originalHeaders };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "content-length" || lower === "content-encoding") delete headers[key];
    }
    return { status: ctx.response.status, headers, body: result.body };
  } catch (error) {
    console.log(`YTM v2.4 passthrough: ${String(error)}`);
    return undefined;
  }
}
