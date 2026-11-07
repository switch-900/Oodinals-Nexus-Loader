#!/usr/bin/env node
/**
 * Offline SatLive release signer. No wallet access, network calls or broadcasts.
 * The pinned developer private key must remain OUTSIDE every repository.
 *
 * node satlive/sign-release.mjs keygen --private /secure/satlive.pem --public ./satlive-public.json
 * node satlive/sign-release.mjs sign --private /secure/satlive.pem \
 *   --app bitmap-nexus --sat 123 --entry <entryId> --content <contentId> \
 *   --file build-ordinals/index.html --version 1.0.0 --sequence 1 \
 *   --out build-ordinals/satlive-release.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { signingPayload, SATLIVE_FORMAT } from './satlive.mjs';

function fail(message) { throw new Error(message); }
function parseArgs(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!name?.startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--') || values.has(name))
      fail('Expected distinct --option value pairs');
    values.set(name, args[i + 1]);
  }
  return values;
}
function option(values, name, optional = false) {
  const value = values.get('--' + name);
  if (!value && !optional) fail('Missing --' + name);
  return value;
}
async function output(path, data, mode = 0o644) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  // Never overwrite a signed manifest or key without explicit review.
  await writeFile(path, data, { flag: 'wx', mode });
}
function publicJwk(privateKey) {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}
function integer(values, name, fallback) {
  const raw = option(values, name, true);
  if (raw === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    fail('Invalid --' + name);
  return Number(raw);
}

const [command, ...args] = process.argv.slice(2);
if (command !== 'keygen' && command !== 'sign') {
  console.error('Usage: sign-release.mjs keygen|sign [--option value ...]');
  process.exit(2);
}
try {
  const flags = parseArgs(args);
  if (command === 'keygen') {
    const privPath = option(flags, 'private');
    const pubPath = option(flags, 'public');
    if (resolve(privPath) === resolve(pubPath)) fail('Public and private key paths must differ');
    const repoDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const privateRelative = relative(repoDir, resolve(privPath));
    if (!privateRelative.startsWith('..') && !isAbsolute(privateRelative))
      fail('Private key must be stored outside this repository');
    const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = keys.privateKey.export({ format: 'pem', type: 'pkcs8' });
    await output(privPath, pem, 0o600);
    await output(pubPath, JSON.stringify(publicJwk(keys.privateKey), null, 2) + '\n');
    console.log('Created a private key outside the repository and a pin-able public JWK.');
  } else {
    const privateKey = createPrivateKey(await readFile(option(flags, 'private')));
    if (privateKey.asymmetricKeyType !== 'ec' ||
        privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      fail('Signer must use an EC P-256 private key');
    const contentBytes = await readFile(option(flags, 'file'));
    if (!contentBytes.length) fail('Empty release content');
    const contentHash = createHash('sha256').update(contentBytes).digest('hex');
    const action = option(flags, 'action', true) || 'release';
    const release = {
      format: SATLIVE_FORMAT,
      app: option(flags, 'app'),
      sat: option(flags, 'sat'),
      entry: option(flags, 'entry'),
      sequence: integer(flags, 'sequence'),
      version: option(flags, 'version'),
      compat: {
        min: integer(flags, 'min-loader', 1),
        max: integer(flags, 'max-loader', 1)
      },
      action,
      content: option(flags, 'content'),
      sha256: contentHash,
      previous: option(flags, 'previous', true) || null
    };
    const signature = sign('sha256', Buffer.from(signingPayload(release)),
      { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const manifest = { ...release, signature };
    const path = option(flags, 'out');
    await output(path, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({
      manifest: path, app: release.app, sat: release.sat, entry: release.entry,
      sequence: release.sequence, action: release.action, version: release.version,
      content: release.content, sha256: release.sha256,
      publicKey: publicJwk(privateKey),
      warning: 'Signatures authorise code. Verify the sat and inscription ID on an independent ord indexer before reinscribing.'
    }, null, 2));
  }
} catch (err) {
  console.error('[SatLive] ' + String(err?.message || err));
  process.exitCode = 1;
}
