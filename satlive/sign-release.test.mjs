import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, createHash } from 'node:crypto';
import { verifySignature } from './satlive.mjs';

const script = fileURLToPath(new URL('./sign-release.mjs', import.meta.url));
const id = c => c.repeat(64) + 'i0';
function cli(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
}

test('offline signer keygen and signed release are WebCrypto interoperable', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'satlive-sign-'));
  try {
    const privateFile = path.join(dir, 'satlive.pem');
    const publicFile = path.join(dir, 'public.json');
    const htmlFile = path.join(dir, 'code.html');
    const manifestFile = path.join(dir, 'release.json');
    const html = '<!doctype html><title>Secure SatLive</title>';
    writeFileSync(htmlFile, html);
    let out = cli(['keygen', '--private', privateFile, '--public', publicFile]);
    assert.equal(out.status, 0, out.stderr);
    assert.doesNotMatch(out.stdout, /BEGIN PRIVATE KEY/);
    out = cli([
      'sign', '--private', privateFile, '--app', 'bitmap-nexus',
      '--sat', '534764996708771', '--entry', id('a'),
      '--content', id('b'), '--file', htmlFile,
      '--version', '1.0.0', '--sequence', '1', '--out', manifestFile
    ]);
    assert.equal(out.status, 0, out.stderr);
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    assert.equal(manifest.content, id('b'));
    assert.equal(manifest.previous, null);
    assert.equal(manifest.sha256, createHash('sha256').update(html).digest('hex'));
    const publicJwk = JSON.parse(readFileSync(publicFile, 'utf8'));
    assert.equal(await verifySignature(manifest, publicJwk, webcrypto.subtle), true);
    assert.equal(await verifySignature({ ...manifest, content: id('c') }, publicJwk, webcrypto.subtle), false);
    assert.equal(cli(['sign', '--private', privateFile, '--app', 'bitmap-nexus',
      '--sat', '123', '--entry', id('a'), '--content', id('b'),
      '--file', htmlFile, '--version', '0.0.1', '--sequence', '1',
      '--out', manifestFile]).status, 1, 'signed manifest must not be overwritten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid signing keys cannot be generated inside the repository', () => {
  const repositoryPath = fileURLToPath(new URL('../', import.meta.url));
  const result = cli(['keygen', '--private', path.join(repositoryPath, 'should-not-create.pem'),
    '--public', path.join(tmpdir(), 'should-not-create-pub.json')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside this repository/);
});
