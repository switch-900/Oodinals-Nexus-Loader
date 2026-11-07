/**
 * SatLive v1 - CSP-safe, same-origin Ordinals release resolver.
 * No package dependencies, origin-shared storage, wallet calls or dynamic code.
 *
 * SECURITY: A trusted application pins an ECDSA P-256 public JWK and the
 * original inscription ID. Same-sat ownership alone conveys no authority.
 */
export const SATLIVE_FORMAT = 'satlive.release.v1';
export const ID_RE = /^[0-9a-f]{64}i(?:0|[1-9][0-9]*)$/;
const HEX_RE = /^[0-9a-f]{64}$/;
const SAT_RE = /^(?:0|[1-9][0-9]*)$/;
const APP_RE = /^[a-z][a-z0-9-]{1,63}$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_MANIFEST_BYTES = 8192;
const SIGNED_KEYS = new Set([
  'format', 'app', 'sat', 'entry', 'sequence', 'version', 'compat',
  'action', 'content', 'sha256', 'previous', 'signature'
]);

function validId(value) { return typeof value === 'string' && ID_RE.test(value); }
function ensure(condition, message) {
  if (!condition) throw new Error('SatLive: ' + message);
}
function validateRelease(release) {
  ensure(release && typeof release === 'object' && !Array.isArray(release), 'invalid release');
  ensure(Object.keys(release).every(key => SIGNED_KEYS.has(key)), 'unknown release field');
  ensure(release.format === SATLIVE_FORMAT, 'unsupported release format');
  ensure(typeof release.app === 'string' && APP_RE.test(release.app), 'invalid app');
  ensure(typeof release.sat === 'string' && SAT_RE.test(release.sat), 'invalid sat');
  ensure(validId(release.entry), 'invalid original inscription ID');
  ensure(Number.isSafeInteger(release.sequence) && release.sequence > 0, 'invalid sequence');
  ensure(typeof release.version === 'string' && SEMVER_RE.test(release.version), 'invalid semantic version');
  ensure(release.compat && typeof release.compat === 'object' &&
    Object.keys(release.compat).length === 2 &&
    Number.isSafeInteger(release.compat.min) &&
    Number.isSafeInteger(release.compat.max) &&
    release.compat.min >= 1 && release.compat.max >= release.compat.min, 'invalid loader compatibility');
  ensure(release.action === 'release' || release.action === 'rollback', 'invalid action');
  ensure(validId(release.content), 'invalid content inscription ID');
  ensure(typeof release.sha256 === 'string' && HEX_RE.test(release.sha256), 'invalid content digest');
  ensure(release.previous === null || validId(release.previous), 'invalid previous release ID');
}

export function signingPayload(release) {
  validateRelease(release);
  // The signed bytes have a fixed field order and domain prefix; JSON object
  // property insertion order cannot change the signature or its meaning.
  return new TextEncoder().encode('SatLive/v1\n' + JSON.stringify([
    release.format, release.app, release.sat, release.entry,
    release.sequence, release.version, release.compat.min,
    release.compat.max, release.action, release.content,
    release.sha256, release.previous
  ]));
}

function decodeBase64Url(encoded) {
  ensure(typeof encoded === 'string' && /^[A-Za-z0-9_-]{86}$/.test(encoded), 'invalid signature encoding');
  const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '==');
  ensure(decoded.length === 64, 'invalid ECDSA signature length');
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}

export async function verifySignature(release, publicKey, subtle = globalThis.crypto?.subtle) {
  validateRelease(release);
  ensure(publicKey && publicKey.kty === 'EC' && publicKey.crv === 'P-256' &&
    typeof publicKey.x === 'string' && typeof publicKey.y === 'string', 'invalid pinned key');
  ensure(subtle, 'WebCrypto unavailable');
  const key = await subtle.importKey('jwk', publicKey, {
    name: 'ECDSA', namedCurve: 'P-256'
  }, false, ['verify']);
  return subtle.verify({
    name: 'ECDSA', hash: 'SHA-256'
  }, key, decodeBase64Url(release.signature), signingPayload(release));
}

export async function hashHex(bytes, subtle = globalThis.crypto?.subtle) {
  ensure(subtle, 'WebCrypto unavailable');
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readBounded(response, maxBytes) {
  ensure(response.ok, 'Ordinals HTTP ' + response.status);
  const length = response.headers?.get?.('content-length');
  if (length !== null && Number(length) > maxBytes) throw new Error('SatLive: oversized response');
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    ensure(bytes.length <= maxBytes, 'oversized response');
    return bytes;
  }
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      ensure(size <= maxBytes, 'oversized response');
      parts.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function http(fetcher, timeoutMs) {
  return async function request(path, maxBytes, parseJson = true) {
    ensure(path.startsWith('/') && !path.startsWith('//'), 'unsafe resource URL');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(path, {
        credentials: 'omit', cache: 'no-store', redirect: 'error',
        signal: controller.signal
      });
      const bytes = await readBounded(response, maxBytes);
      if (!parseJson) return bytes;
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new Error('SatLive: invalid Ordinals JSON at ' + path); }
    } finally {
      clearTimeout(timer);
    }
  };
}

function compareVersion(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
function mime(contentType) {
  return String(contentType || '').split(';')[0].trim().toLowerCase();
}
function configCheck(config) {
  ensure(config && typeof config === 'object', 'missing configuration');
  ensure(typeof config.app === 'string' && APP_RE.test(config.app), 'invalid configured app');
  ensure(typeof config.sat === 'string' && SAT_RE.test(config.sat), 'invalid configured sat');
  ensure(validId(config.entry), 'invalid configured original inscription ID');
  ensure(config.publicKey?.kty === 'EC' && config.publicKey?.crv === 'P-256',
    'a pinned developer public key is required');
  ensure(Number.isSafeInteger(config.loaderVersion ?? 1) && (config.loaderVersion ?? 1) > 0, 'invalid loader version');
}

export async function resolveSatLive(config, options = {}) {
  if (!config?.enabled) return { status: 'disabled', history: [] };
  try {
    configCheck(config);
    const fetcher = options.fetch || globalThis.fetch?.bind(globalThis);
    ensure(fetcher, 'fetch unavailable');
    const subtle = options.subtle || globalThis.crypto?.subtle;
    ensure(subtle, 'WebCrypto unavailable');
    const currentId = options.currentId || String(globalThis.location?.pathname || '').match(
      /^\/content\/([0-9a-f]{64}i(?:0|[1-9][0-9]*))$/
    )?.[1] || config.entry;
    ensure(validId(currentId), 'invalid current inscription ID');
    const maxPages = config.maxPages ?? 10;
    ensure(Number.isSafeInteger(maxPages) && maxPages >= 1 && maxPages <= 30, 'invalid page limit');
    const maxContentBytes = config.maxContentBytes ?? 16 * 1024 * 1024;
    ensure(Number.isSafeInteger(maxContentBytes) && maxContentBytes > 0 &&
      maxContentBytes <= 32 * 1024 * 1024, 'invalid content limit');
    const timeoutMs = config.timeoutMs ?? 6000;
    ensure(Number.isSafeInteger(timeoutMs) && timeoutMs >= 500 && timeoutMs <= 30000, 'invalid timeout');
    const request = http(fetcher, timeoutMs);
    const satRoot = '/r/sat/' + config.sat;
    const newest = (await request(satRoot + '/at/-1', 1024)).id;
    ensure(validId(newest), 'invalid newest inscription ID');

    const ids = [], seen = new Set();
    for (let page = 0; page < maxPages; page++) {
      const listing = await request(satRoot + '/' + page, 16000);
      ensure(Array.isArray(listing.ids) && typeof listing.more === 'boolean' &&
        listing.ids.length <= 100, 'invalid sat history page');
      for (const id of listing.ids) {
        ensure(validId(id) && !seen.has(id), 'invalid or repeated sat inscription');
        seen.add(id);
        ids.push(id);
      }
      if (!listing.more) break;
      ensure(page < maxPages - 1, 'sat history exceeds configured scan limit');
    }
    ensure(ids.length > 0 && ids[ids.length - 1] === newest,
      'sat history is incomplete or inconsistent');
    ensure(ids.includes(config.entry), 'original inscription not on configured sat');

    const confirmedHeight = config.minConfirmations ?? 1;
    ensure(Number.isSafeInteger(confirmedHeight) && confirmedHeight >= 0 &&
      confirmedHeight <= 144, 'invalid confirmation requirement');
    const chainHeight = confirmedHeight ? await request('/r/blockheight', 64) : null;
    if (confirmedHeight) ensure(Number.isSafeInteger(chainHeight) && chainHeight > 0,
      'invalid current block height');
    const metadata = new Map();
    const getMetadata = async id => {
      if (!metadata.has(id)) {
        const item = await request('/r/inscription/' + id, 8192);
        ensure(item?.id === id, 'inscription metadata ID mismatch');
        if (item.sat !== null && item.sat !== undefined)
          ensure(String(item.sat) === config.sat, 'inscription sat mismatch');
        metadata.set(id, item);
      }
      return metadata.get(id);
    };
    const checkConfirmed = item => {
      if (confirmedHeight) ensure(Number.isSafeInteger(item.height) &&
        chainHeight - item.height + 1 >= confirmedHeight, 'inscription is not sufficiently confirmed');
    };
    const history = [];
    const allowedContentTypes = config.allowedContentTypes || ['text/html'];
    ensure(Array.isArray(allowedContentTypes) && allowedContentTypes.length > 0 &&
      allowedContentTypes.every(t => typeof t === 'string' && t.length > 0), 'invalid content type policy');
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      const meta = await getMetadata(id);
      const type = mime(meta.content_type);
      if (type !== 'application/json' && type !== 'application/vnd.satlive.release+json') continue;
      const bytes = await request('/content/' + id, MAX_MANIFEST_BYTES, false);
      let release;
      try { release = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { continue; }
      if (release?.format !== SATLIVE_FORMAT) continue;
      validateRelease(release);
      ensure(release.app === config.app && release.sat === config.sat &&
        release.entry === config.entry, 'signed release identity mismatch');
      ensure(await verifySignature(release, config.publicKey, subtle), 'invalid release signature');
      ensure(release.compat.min <= (config.loaderVersion ?? 1) &&
        release.compat.max >= (config.loaderVersion ?? 1), 'incompatible release loader');
      checkConfirmed(meta);
      const previous = history.at(-1);
      ensure(release.sequence === (previous?.sequence ?? 0) + 1 &&
        release.previous === (previous?.manifestId ?? null), 'release chain gap or fork');
      if (previous && release.action === 'release')
        ensure(compareVersion(release.version, previous.version) > 0, 'unauthorised downgrade');
      if (release.action === 'rollback')
        ensure(previous && history.some(item => item.content === release.content &&
          item.sha256 === release.sha256), 'rollback must target previously authorised bytes');
      ensure(seen.has(release.content) && ids.indexOf(release.content) < index,
        'release content must precede manifest on the same sat');
      const contentMeta = await getMetadata(release.content);
      checkConfirmed(contentMeta);
      ensure(allowedContentTypes.includes(mime(contentMeta.content_type)),
        'release has incompatible content type');
      const actual = await hashHex(await request('/content/' + release.content,
        maxContentBytes, false), subtle);
      ensure(actual === release.sha256, 'release content SHA-256 mismatch');
      history.push(Object.freeze({
        manifestId: id, sequence: release.sequence, version: release.version,
        action: release.action, content: release.content, sha256: release.sha256
      }));
    }
    const after = (await request(satRoot + '/at/-1', 1024)).id;
    ensure(after === newest, 'sat changed during resolution (possible reorganisation)');
    // Fail closed if a previously loaded updated inscription is no longer authorised.
    const selected = history.at(-1);
    if (!selected) {
      ensure(currentId === config.entry, 'current code has no authorised release');
      return { status: 'current', content: config.entry, history };
    }
    ensure(currentId === config.entry || history.some(item => item.content === currentId),
      'current code is not part of the authorised release history');
    return Object.freeze({
      status: selected.content === currentId ? 'current' : 'update',
      content: selected.content, release: selected, history
    });
  } catch (error) {
    return { status: 'blocked', reason: String(error?.message || error), history: [] };
  }
}

/**
 * Resolves before mounting a React app or starting a wallet session.
 * A blocked update requires a conscious retry or explicit bundled-code choice;
 * no untrusted response ever becomes script code.
 */
export async function startSatLive(config, startBundled, options = {}) {
  const result = await resolveSatLive(config, options);
  if (result.status === 'update') {
    const location = options.location || globalThis.location;
    ensure(location?.replace, 'navigation unavailable');
    location.replace('/content/' + result.content);
  } else if (result.status === 'disabled' || result.status === 'current') {
    await startBundled();
  } else if (options.onBlocked) {
    options.onBlocked(result);
  } else if (globalThis.document) {
    renderRecovery(result, startBundled);
  }
  return result;
}

export function renderRecovery(result, startBundled, root = globalThis.document?.body) {
  if (!root || !globalThis.document) return;
  const doc = globalThis.document;
  const panel = doc.createElement('section');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = 'box-sizing:border-box;max-width:32rem;margin:8vh auto;padding:24px;' +
    'border:1px solid #687481;border-radius:18px;background:#101820;color:#fff;' +
    'font:16px/1.5 system-ui,sans-serif;overflow-wrap:anywhere';
  const heading = doc.createElement('h1');
  heading.textContent = 'Update verification unavailable';
  heading.style.cssText = 'font-size:1.25rem;margin:0 0 12px';
  const message = doc.createElement('p');
  message.textContent = result.reason || 'The on-chain release could not be verified.';
  const hint = doc.createElement('p');
  hint.textContent = 'No replacement code has been executed. You can retry or deliberately open the original bundled version.';
  const controls = doc.createElement('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:20px';
  const retry = doc.createElement('button');
  retry.textContent = 'Retry verification';
  retry.style.cssText = 'min-height:44px;padding:10px;border-radius:10px';
  retry.addEventListener('click', () => globalThis.location?.reload());
  const original = doc.createElement('button');
  original.textContent = 'Run original bundled version';
  original.style.cssText = 'min-height:44px;padding:10px;border-radius:10px';
  original.addEventListener('click', async () => {
    panel.remove();
    await startBundled();
  }, { once: true });
  controls.append(retry, original);
  panel.append(heading, message, hint, controls);
  root.replaceChildren(panel);
}
