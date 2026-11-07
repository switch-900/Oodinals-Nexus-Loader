import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash, generateKeyPairSync, createPublicKey, sign, webcrypto
} from 'node:crypto';
import {
  SATLIVE_FORMAT, signingPayload, verifySignature, resolveSatLive, startSatLive
} from './satlive.mjs';

const id = digit => digit.repeat(64) + 'i0';
const ENTRY = id('a'), C1 = id('b'), M1 = id('c'), C2 = id('d');
const M2 = id('e'), C3 = id('f'), M3 = id('1'), OTHER = id('2');
const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = createPublicKey(keys.privateKey).export({ format: 'jwk' });
const publicKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
const sha = s => createHash('sha256').update(s).digest('hex');
const config = Object.freeze({
  enabled: true, app: 'bitmap-nexus', sat: '123456789',
  entry: ENTRY, publicKey, timeoutMs: 1000, loaderVersion: 1
});
const content = new Map([[ENTRY, '<h1>original</h1>'], [C1, '<h1>one</h1>'],
  [C2, '<h1>two</h1>'], [C3, '<h1>three</h1>']]);
function makeRelease(sequence, previous, target, version, action = 'release') {
  const release = {
    format: SATLIVE_FORMAT, app: config.app, sat: config.sat, entry: ENTRY,
    sequence, version, compat: { min: 1, max: 1 }, action, content: target,
    sha256: sha(content.get(target)), previous
  };
  return { ...release, signature: sign('sha256', Buffer.from(signingPayload(release)),
    { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
}

function simulation({ stages = 3, tamper = null, rollback = false, unrelated = false,
  changeLatest = false, missing = false, splitPages = false, transfer = false } = {}) {
  const r1 = makeRelease(1, null, C1, '1.0.0');
  const r2 = makeRelease(2, M1, C2, '1.1.0');
  const r3 = makeRelease(3, M2, rollback ? C1 : C3,
    rollback ? '1.0.0' : '1.2.0', rollback ? 'rollback' : 'release');
  const items = [
    [ENTRY, 'text/html', content.get(ENTRY)]
  ];
  if (stages >= 1) items.push([C1, 'text/html', content.get(C1)], [M1, 'application/json', JSON.stringify(r1)]);
  if (stages >= 2) items.push([C2, 'text/html', content.get(C2)], [M2, 'application/json', JSON.stringify(r2)]);
  if (stages >= 3) items.push([C3, 'text/html', content.get(C3)], [M3, 'application/json', JSON.stringify(r3)]);
  if (unrelated) items.push([OTHER, 'text/html', '<p>unrelated</p>']);
  if (tamper) tamper(items);
  const list = items.map(([key]) => key);
  const pages = splitPages ? [list.slice(0, 3), list.slice(3)] : [list];
  const requests = [];
  let atCalls = 0;
  const fetch = async (path, options) => {
    requests.push({ path, options });
    if (missing) throw new TypeError('network offline');
    let response;
    if (path === '/r/sat/123456789/at/-1') {
      atCalls++;
      response = { id: changeLatest && atCalls > 1 ? OTHER : list.at(-1) };
    } else if (path === '/r/sat/123456789/0') {
      response = { ids: pages[0], more: pages.length > 1 };
    } else if (path === '/r/sat/123456789/1' && pages.length > 1) {
      response = { ids: pages[1], more: false };
    } else if (path === '/r/blockheight') {
      response = 50;
    } else if (path.startsWith('/r/inscription/')) {
      const key = path.slice('/r/inscription/'.length);
      const item = items.find(([itemId]) => itemId === key);
      if (!item) return new Response('Not Found', { status: 404 });
      response = { id: key, sat: config.sat, height: 40, content_type: item[1],
        address: transfer ? 'different-sat-owner' : 'first-sat-owner' };
    } else if (path.startsWith('/content/')) {
      const key = path.slice('/content/'.length);
      const item = items.find(([itemId]) => itemId === key);
      return item ? new Response(item[2], { status: 200 }) : new Response('Not Found', { status: 404 });
    } else {
      return new Response('Not Found', { status: 404 });
    }
    return Response.json(response);
  };
  return { fetch, requests };
}

test('P-256 signature matches portable browser WebCrypto verification', async () => {
  const r = makeRelease(1, null, C1, '1.0.0');
  assert.equal(await verifySignature(r, publicKey, webcrypto.subtle), true);
  assert.equal(await verifySignature({ ...r, action: 'rollback' }, publicKey, webcrypto.subtle), false);
});

test('V1 permanent entry discovers and verifies signed V3, content hash and sat membership', async () => {
  const env = simulation({ splitPages: true });
  const res = await resolveSatLive(config, { fetch: env.fetch, subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'update', res.reason);
  assert.equal(res.release.sequence, 3);
  assert.equal(res.content, C3);
  assert.equal(res.history.length, 3);
  assert.ok(env.requests.some(r => r.path === '/r/sat/123456789/at/-1'));
  assert.ok(env.requests.some(r => r.path === '/r/inscription/' + M3));
  assert.ok(env.requests.some(r => r.path === '/content/' + C3));
  assert.ok(env.requests.every(r => r.options.cache === 'no-store' && r.options.redirect === 'error'));
});

test('already-loaded V3 runs without a redirect loop', async () => {
  const env = simulation();
  let started = 0, redirect = null;
  const res = await startSatLive(config, () => { started++; }, {
    fetch: env.fetch, subtle: webcrypto.subtle, currentId: C3,
    location: { replace: url => { redirect = url; } }
  });
  assert.equal(res.status, 'current');
  assert.equal(started, 1);
  assert.equal(redirect, null);
});

test('original entry redirects only after all verified checks', async () => {
  const env = simulation();
  let started = 0, redirect;
  const res = await startSatLive(config, () => { started++; }, {
    fetch: env.fetch, subtle: webcrypto.subtle, currentId: ENTRY,
    location: { replace: url => { redirect = url; } }
  });
  assert.equal(res.status, 'update');
  assert.equal(redirect, '/content/' + C3);
  assert.equal(started, 0);
});

test('explicit signed rollback selects previously authorised bytes', async () => {
  const res = await resolveSatLive(config,
    { ...simulation({ rollback: true }), subtle: webcrypto.subtle, currentId: C3 });
  assert.equal(res.status, 'update', res.reason);
  assert.equal(res.content, C1);
  assert.equal(res.release.action, 'rollback');
});

test('unrelated last reinscription cannot replace signed code', async () => {
  const res = await resolveSatLive(config,
    { ...simulation({ unrelated: true }), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'update', res.reason);
  assert.equal(res.content, C3);
});

test('changing sat ownership does not confer signing authority or invalidate signed history', async () => {
  const res = await resolveSatLive(config,
    { ...simulation({ transfer: true }), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'update', res.reason);
});

test('metadata or indexer failure blocks; never silently selects old content', async () => {
  const res = await resolveSatLive(config,
    { ...simulation({ missing: true }), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'blocked');
  assert.match(res.reason, /offline/);
});

test('stale, incomplete or reorganised sat snapshot is blocked', async () => {
  const res = await resolveSatLive(config,
    { ...simulation({ changeLatest: true }), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'blocked');
  assert.match(res.reason, /reorganisation/);
});

test('too-short history scan fails closed', async () => {
  const res = await resolveSatLive({ ...config, maxPages: 1 },
    { ...simulation({ splitPages: true }), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'blocked');
  assert.match(res.reason, /scan limit/);
});

test('unsigned substituted HTML bytes do not execute', async () => {
  const res = await resolveSatLive(config, {
    ...simulation({ tamper: items => { items.find(x => x[0] === C3)[2] = '<script>evil()</script>'; } }),
    subtle: webcrypto.subtle, currentId: ENTRY
  });
  assert.equal(res.status, 'blocked');
  assert.match(res.reason, /SHA-256/);
});

test('tampered signed rollback or release is rejected', async () => {
  const res = await resolveSatLive(config, {
    ...simulation({ tamper: items => {
      const line = items.find(x => x[0] === M3);
      const forged = JSON.parse(line[2]);
      forged.content = C1;
      line[2] = JSON.stringify(forged);
    } }), subtle: webcrypto.subtle, currentId: ENTRY
  });
  assert.equal(res.status, 'blocked');
  assert.match(res.reason, /signature/);
});

test('stolen sat cannot publish a release for a different application identity', async () => {
  const res = await resolveSatLive(config, {
    ...simulation({ tamper: items => {
      const line = items.find(x => x[0] === M3);
      const forged = JSON.parse(line[2]);
      forged.app = 'other-wallet';
      line[2] = JSON.stringify(forged);
    } }), subtle: webcrypto.subtle, currentId: ENTRY
  });
  assert.equal(res.status, 'blocked');
});

test('loader ABI incompatibility blocks rather than loading code', async () => {
  const res = await resolveSatLive({ ...config, loaderVersion: 2 },
    { ...simulation(), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'blocked');
  assert.match(res.reason, /incompatible release loader/);
});

test('first original inscription with no release runs its bundled code', async () => {
  const res = await resolveSatLive(config,
    { ...simulation({ stages: 0 }), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'current', res.reason);
  assert.equal(res.content, ENTRY);
  assert.deepEqual(res.history, []);
});

test('invalid configuration or no pinned developer key fails closed when enabled', async () => {
  const res = await resolveSatLive({ ...config, publicKey: null },
    { ...simulation(), subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'blocked');
  assert.match(res.reason, /pinned/);
});

test('disabled integration preserves current app with no network calls', async () => {
  const env = simulation();
  const res = await resolveSatLive({ ...config, enabled: false },
    { fetch: env.fetch, subtle: webcrypto.subtle, currentId: ENTRY });
  assert.equal(res.status, 'disabled');
  assert.equal(env.requests.length, 0);
});
