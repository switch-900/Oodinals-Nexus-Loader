# SatLive — signed same-sat Ordinals releases

SatLive is for **new, compatible launchers**, not rewriting existing inscriptions. It resolves signed application releases from inscriptions on the same sat and navigates only to an immutable content ID whose SHA-256 bytes match the signed release.

## Security model

- The original SatLive launcher pins an ECDSA P-256 public JWK and sat number. The first launcher may use `entry: 'self'` because its own inscription ID is unknown at build time. Subsequent app versions must pin the original launcher's exact ID.
- The signed fields are: format, application, sat, original entry inscription ID, sequence, semantic version, loader compatibility, action, target content inscription ID, content SHA-256, and prior release inscription ID.
- A new release requires the previous manifest ID and exactly the next sequence, with a higher semantic version. A signed rollback may select an older content inscription that appeared in the verified history.
- The release manifest must itself be on the configured sat, **after** its target content inscription, and served as `application/json`. A legitimate release consists of **two reinscriptions**: payload first, signed JSON manifest second.
- Cross-origin scripts, dynamic code evaluation, origin-shared storage, hidden iframes, and on-chain wallet-signing actions are not used by SatLive. No code from `/content/{ID}` is run until release signatures and bytes are checked.
- Signatures are rooted in the pinned developer key, **not** the wallet that owns the sat. Only authenticated releases are accepted. Unsigned reinscriptions cannot update your app.
- The indexer must serve the official recursive endpoints with sat indexing enabled. No central database or indexing API is required; the browser still trusts its Ordinals node's view of Bitcoin and this is **not an SPV proof**.
- A compromised indexer, reorg, missing history, incomplete confirmations, incompatible ABI, mismatch or signature error is not silently treated as permission to downgrade. The error screen provides Retry or an explicit button for the original bundled version. An attacker with the sat can cause denial-of-service even without the signing key.
- The implementation does not automatically make **other mutable imports** safe: the Nexus Core, SDK, Loader and Rapier references currently use unsigned latest-sat imports. They require separate review.

## Runtime example

Bundle the module directly into the immutable launcher HTML during your existing Vite or standalone HTML build. The module has no dependencies:

```js
import { startSatLive } from './satlive.mjs';

const config = {
  enabled: true,
  app: 'bitmap-nexus', // or '0ns', 'oodl'
  sat: 'SAT_NUMBER',
  entry: 'self',         // ONLY for the first launcher
  publicKey: { kty: 'EC', crv: 'P-256', x: '...', y: '...' },
  loaderVersion: 1,
  allowedContentTypes: ['text/html'],
  minConfirmations: 1
};
await startSatLive(config, () => startNormalApp());
```

The first launcher derives the real entry ID from its own `/content/{ID}` path. Once inscribed, note that ID. Newer content versions MUST use that exact ID as `entry` (not `self`), and sign manifests against it. If a newer version uses `self`, it will fail verification rather than guess an entry.

Existing immutable old inscriptions that did not ship this resolver **will not become update-aware**. Build a separate stable SatLive launcher and share that as the new entry.

## Offline signing / publishing

Never commit the developer private key or inscribe it. The CLI has no network, wallet or broadcast operations.

1. Generate a P-256 private key OUTSIDE the Git checkout:

   ```sh
   node satlive/sign-release.mjs keygen --private /secure/offline/satlive.pem --public ./satlive-public.json
   ```

2. Embed the public JWK in a new launcher and inscribe it on the intended sat. Identify its inscription ID from an independent indexer. Keep the original link.
3. Reinscribe the updated HTML payload **on the same sat**, inspect the reveal ID, satpoint, output and actual content type.
4. Sign the *decoded HTML response bytes* of the updated inscription (normally the uncompressed HTML build; make sure it matches `/content/ID` after HTTP content encoding):

   ```sh
   node satlive/sign-release.mjs sign \
     --private /secure/offline/satlive.pem \
     --app bitmap-nexus --sat SAT_NUMBER \
     --entry ORIGINAL_LAUNCHER_ID --content NEW_CONTENT_ID \
     --file build-ordinals/index.html \
     --version 1.0.0 --sequence 1 \
     --out build-ordinals/satlive-release.json
   ```

5. Reinscribe that JSON with `application/json` on the same sat; verify complete indexer history and allow sufficient confirmations.
6. For later releases use `--sequence 2 --previous PRIOR_MANIFEST_ID --version 1.1.0`. To roll back intentionally use `--action rollback`, a later sequence, a previous authorised target ID and its identical SHA-256 digest.

Official `ord` examples (check the installed version, fees, wallet, sat ownership and reveal ordering):

```sh
ord --index-sats wallet inscribe --fee-rate FEE --reinscribe --file app.html --sat SAT
ord --index-sats wallet inscribe --fee-rate FEE --reinscribe --file satlive-release.json --sat SAT
```

SatLive will NOT create transactions, select UTXOs or broadcast a reinscription. In your Nexus Inscriber, reuse its sat-alignment and separate-fee-pool safeguards.

## Existing codebase integration

| Repository | Current state | Integration plan |
| --- | --- | --- |
| bitmap-onchain-map | Vite singlefile, React 18, on-chain import map | Bundle the resolver before mounting React, without modifying the production wallet flow |
| 0ns | Two inline module tags, fixed audited hash release, Brotli | Embed the resolver in the existing second UI module before initialisation; re-lock a new audited release |
| nexus-inscriber | Distinct Core, SDK and Loader releases | Verify each executable before importing it; no unsafe latest-module import |
| OODL-Protocol | Protocol docs and a landing website | Use SatLive for an actual future HTML runtime inscription; do not confuse the docs website with an updatable on-chain app |
| Oodinals-Nexus-Loader | Public readme/examples | Maintains the dependency-free SatLive module, offline signer and adversarial tests |

Tests: `node --test satlive/satlive.test.mjs`

Limitations: navigating to `/content/NEW_ID` changes the internal URL; an outer inscription viewer may still show the entry URL. In-memory React state, wallet providers, WebRTC and live multiplayer rooms do not survive document navigation. Reconnect and rehydrate only safe context; never persist signing secrets on a shared Ordinals origin.
