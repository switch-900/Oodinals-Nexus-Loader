# Oodinals-Nexus Loader - Quick Start

**Loader sat:** `534764996708771`

Import one on-chain loader for wallet connectivity, inscriptions, UTXO helpers, marketplace functions and related Nexus functionality.

---

## 1. Import the loader

From an on-chain inscription or compatible host:

```html
<script type="module">
  const {
    default: Nexus,
    NexusWalletConnect
  } = await import(
    '/r/sat/534764996708771/at/-1/content'
  );
</script>
```

No npm or build step is required.

For Bitcoin address history without a popup, see [WebRTC-first transport](WEBRTC-DATA-TRANSPORT.md). **A live Ordinals-host session on 9 October 2026 returned 3 transactions through `window.NexusRelay.request('address-txs', ...)` without invoking the proxy.** The [read-only probe](examples/nexus-webrtc-probe.html) now checks whether the relay appears only *after* importing the Loader; this before/after check distinguishes an actual Loader export from a relay API already installed by another page script.

### Keep on-chain URLs host-relative

Prefer:

```text
/r/...
/content/...
/r/sat/.../at/-1/content
```

Do not hard-code an explorer host unless your app explicitly needs that specific origin.

External website example:

```js
window.__NEXUS_ORDINALS_ORIGIN__ =
  'https://ordinals.com';

const {
  default: Nexus,
  NexusWalletConnect
} = await import(
  'https://ordinals.com/r/sat/534764996708771/at/-1/content'
);
```

---

## 2. Connect a wallet correctly on desktop and mobile

Import both Loader surfaces for mobile-aware applications:

```js
const {
  default: Nexus,
  NexusWalletConnect: NWC
} = await import('/r/sat/534764996708771/at/-1/content');
```

### Desktop / wallet in-app browser

If the provider is already injected, the normal connection remains valid:

```js
await Nexus.connectWallet('unisat');

const state = Nexus.getWalletState();
console.log(state.paymentAddress);
console.log(state.ordinalsAddress);
```

This does not describe UniSat in a normal phone browser with no injected `window.unisat` provider.

### Xverse and Phantom

Xverse and Phantom can open the current dApp in their in-app browser:

```js
const result = await NWC.connectSmart('Xverse', {
  targetUrl: location.href
});

if (result?.redirected) return;
```

Use the same pattern for Phantom. After a redirect, stop work in the old browser context and allow the dApp to reload inside the wallet browser.

### UniSat normal mobile browser

The known-working integration does **not** use `openDapp` as the UniSat connection handshake. Use the method-level UniSat RPC bridge directly from the user's tap:

```text
unisat://request?method=connect&from=NexusWallet&nonce=<nonce>
```

If `connect` is unavailable, retry with a new nonce using:

```text
unisat://request?method=requestAccounts&from=NexusWallet&nonce=<new-nonce>
```

Minimal request builder:

```js
function nonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') +
    '-' + Date.now().toString(16);
}

function encodeBase64Json(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildUniSatRequest(method, params = null) {
  const requestNonce = nonce();
  let url =
    `unisat://request?method=${encodeURIComponent(method)}` +
    `&from=${encodeURIComponent('NexusWallet')}` +
    `&nonce=${encodeURIComponent(requestNonce)}`;

  if (params !== null) {
    url += `&data=${encodeURIComponent(encodeBase64Json(params))}`;
  }

  return { url, nonce: requestNonce };
}
```

Launch it directly from the user's click/tap:

```js
const request = buildUniSatRequest('connect');
sessionStorage.setItem('nexus_unisat_pending_nonce', request.nonce);
window.location.href = request.url;
```

Do not place an unrelated awaited network request or import between the user's tap and `window.location.href`.

A response may look like:

```text
unisat://response?data=<base64-json>&nonce=<nonce>
```

Accept response data only after the returned nonce exactly matches the pending request.

### UniSat signing

Use the same bridge for signing:

```js
buildUniSatRequest('signPsbt', [psbtHex, options]);
buildUniSatRequest('signPsbts', [psbtHexArray, optionsArray]);
buildUniSatRequest('signMessage', [message, type]);
```

A production mobile bridge should keep pending requests keyed by nonce, re-check responses when focus/visibility returns, inspect query/hash response data, validate the nonce before decoding `data`, update provider/state only after a valid response, and provide a manual `submitUniSatMobileResponse(text)` fallback when UniSat displays a response URI instead of returning it automatically.

### Recommended connection split

```js
async function connectWallet(walletName) {
  // UniSat normal mobile browser:
  // use the RPC bridge above when window.unisat is not injected.

  // Xverse / Phantom / injected providers:
  const result = await NWC.connectSmart(walletName, {
    targetUrl: location.href
  });

  if (result?.redirected) return result;

  const state = NWC.getState?.();
  const provider = NWC.getCurrentProvider?.();

  if (!(state?.isConnected || state?.connected) || !provider) {
    throw new Error('Wallet connection did not retain a provider');
  }

  return { redirected: false, state, provider };
}
```

Do **not** document UniSat `openDapp` as equivalent to this proven method-level connection bridge.

### Loader / SDK synchronisation

For inscriptions, buying, listing and other PSBT flows, the SDK must retain the provider associated with the validated wallet connection. A UI-only address is not a complete connection.

### Mobile security rules

- generate nonces with `crypto.getRandomValues()` where available;
- store only minimum pending metadata in `sessionStorage`;
- require an exact nonce match before accepting response data;
- never accept `javascript:` or `data:` wallet links;
- keep wallet launch/navigation in the direct user gesture;
- never continue signing or transaction construction while connection is pending/redirected;
- treat wallet inventory as discovery only and validate current ownership on-chain before authorising an asset action.

### Wallet discovery

Do not hide wallet choices merely because a standard phone browser has no injected providers:

```js
const installed = NWC.detectWallets?.() || [];
const mobile = NWC.listMobileWalletOptions?.({
  targetUrl: location.href
}) || [];
```

These are discovery helpers. They do not mean every wallet uses the same transport.

### Documented wallet IDs

```text
unisat
xverse
okx
leather
phantom
wizz
oyl
bitmapwallet
```

### Disconnect

```js
await NWC.disconnect?.();
await Nexus.disconnect?.();
```

---

## 3. Create a text inscription

Pass plain text as plain text:

```js
const result =
  await Nexus.createInscription({
    feeRate: 10,
    items: [
      {
        content:
          'Hello Bitcoin!',
        contentType:
          'text/plain;charset=utf-8'
      }
    ]
  });

console.log(result);
```

Do not use `btoa()` for a normal text inscription.

Binary/base64 payload:

```js
await Nexus.createInscription({
  feeRate: 10,
  items: [
    {
      contentBase64:
        '<base64-encoded-png>',
      contentType:
        'image/png'
    }
  ]
});
```

---

## 4. Estimate fees

```js
const estimate =
  await Nexus.estimateFees({
    feeRate: 10,
    items: [
      {
        content:
          'Hello Bitcoin!',
        contentType:
          'text/plain;charset=utf-8'
      }
    ]
  });

console.log(
  estimate.totalRequired
);
```

Live fee tiers:

```js
const rates =
  await Nexus.getFeeRates();

console.log(rates);
```

Single tier:

```js
const feeRate =
  await Nexus.getFeeRate('medium');
```

---

## 5. Spendable UTXOs

```js
const state =
  Nexus.getWalletState();

const utxos =
  await Nexus.getSpendableUtxos([
    state.paymentAddress
  ]);
```

Classified:

```js
const classified =
  await Nexus.fetchSpendableUtxos([
    state.paymentAddress
  ]);

console.log(classified.spendable);
console.log(classified.unsafe);
```

Raw:

```js
const raw =
  await Nexus.fetchUtxos([
    state.paymentAddress
  ]);
```

---

## 6. Buy a listing

```js
const state =
  Nexus.getWalletState();

const utxos =
  await Nexus.getSpendableUtxos([
    state.paymentAddress
  ]);

await Nexus.buyFromInscriptionId({
  inscriptionId: '<txid>i0',
  buyerPaymentUtxos: utxos,
  buyerChangeAddress:
    state.paymentAddress,
  buyerReceiveAddress:
    state.ordinalsAddress,
  feeRateSatPerVb: 10,
  broadcast: true
});
```

---

## 7. Parent-child chain

Sequential example:

```js
const parent =
  await Nexus.createInscription({
    feeRate: 10,
    items: [
      {
        content: 'Parent',
        contentType: 'text/plain'
      }
    ]
  });

const parentId =
  `${parent.revealTxIds[0]}i0`;

const child =
  await Nexus.createInscription({
    feeRate: 10,
    defaults: {
      parentIds: [parentId]
    },
    items: [
      {
        content: 'Child',
        contentType: 'text/plain'
      }
    ]
  });
```

A parent tag and a true parent-UTXO spend are not automatically the same thing. If your design requires a true on-chain relationship, ensure transaction construction actually uses the intended parent UTXO.

---

## 8. Chain/tree orchestration

Current loader methods:

```text
createInscriptionTree(opts)
createInscriptionChain(opts)
```

Complete the mobile-aware wallet connection first before calling signing/orchestration methods from a normal mobile browser.

Runtime detection:

```js
console.log(
  Nexus.getCapabilities()
);

console.log(
  Nexus.getVersionInfo()
);
```

---

## 9. Recursive HTML rule

Run active recursive HTML from its real:

```text
/content/<inscription-id>
```

URL when possible.

Synthetic contexts such as:

```text
about:srcdoc
```

can break:

```js
location.href
location.pathname
document.baseURI
new URL(relative, location.href)
```

and recursive:

```js
fetch('/r/...');
fetch('/content/...');
```

---

## 10. SVG rule

`image/svg+xml` can be a passive image or an active document.

Cheap thumbnail:

```html
<img src="/content/<id>" alt="">
```

Interactive/document SVG should use a deliberate sandboxed document context.

---

## 11. Bitmap rule

For:

```text
N.bitmap
```

`N` is the Bitcoin block being represented.

It is not necessarily the block containing the inscription.

Keep separate:

```text
target block = N
claim block  = H
```

Example:

```text
969422.bitmap
```

can be mined in block:

```text
969426
```

but its geometry must still come from Bitcoin block `969422`.

### First-claim verification

```text
H < N
  invalid

H = N
  first same-block candidate can be valid

H > N
  inspect blocks N through H-1
```

If an earlier `N.bitmap` exists, the later candidate is not first.

If required blocks are not yet checked, use:

```text
pending / unverified
```

Do not search below target block `N`.

---

## 12. Debugging console errors

Console errors may come from:

- Nexus/your outer app
- the embedded inscription
- wallet extensions
- injected providers
- external APIs used by the embedded app

Example:

```text
Cannot redefine property: StacksProvider
at inpage.js
```

can be a provider-injection conflict.

Example:

```text
mempool.space returned 400
at btcapi.js
```

can belong to an embedded inscription's API code.

Always inspect the stack source before changing Nexus.

Useful checks:

```js
console.log(location.href);
console.log(location.pathname);
console.log(document.baseURI);
```

```js
console.log(
  await fetch('/r/blockheight')
    .then(r => r.text())
);
```

---

## Method reference

### Nexus Loader

| Method | Description |
|---|---|
| `connectWallet(type)` | Connect through an injected provider |
| `disconnect()` | Disconnect Loader wallet state |
| `getWalletState()` | Loader wallet state |
| `getInstalledWallets()` | Detected injected providers |
| `createInscription(config)` | Create inscription(s) |
| `createInscriptionTree(opts)` | Tree/DAG orchestration |
| `createInscriptionChain(opts)` | Chain orchestration |
| `estimateFees(config)` | Estimate fees |
| `validateJson(config)` | Validate config |
| `getCapabilities()` | Runtime capabilities |
| `getVersionInfo()` | Version diagnostics |
| `getFeeRates(network?)` | Fee-rate tiers |
| `getFeeRate(priority?, network?)` | Single fee rate |
| `getSpendableUtxos(addrs)` | Spendable UTXOs |
| `fetchUtxos(addrs?)` | Raw UTXOs |
| `fetchSpendableUtxos(addrs?)` | Classified UTXOs |
| `createMarketplaceClient(cfg)` | Marketplace client |
| `buyFromRevealTx(params)` | Buy by reveal txid |
| `buyFromInscriptionId(params)` | Buy by inscription ID |
| `sellWith3TxFlow(params)` | Listing/sale flow |
| `applyPlatformSellerFeeToMarker(params)` | Sale marker |
| `loadCollectionsRegistry()` | Collections registry |
| `matchCollectionForInscription(id)` | Collection matching |

### `NexusWalletConnect`

| Method | Description |
|---|---|
| `connectSmart(walletName, options)` | Provider-aware connection / wallet-browser handoff; UniSat normal-mobile RPC uses a separate bridge |
| `connectWithStrategy(walletName, options)` | Explicit connection strategy |
| `connect(walletName)` | Named wallet connection |
| `tryMobileAutoReconnect()` | Restore supported wallet-browser deep-link handoffs where applicable; not a substitute for UniSat nonce/RPC response validation |
| `detectWallets()` | Detect injected providers |
| `listMobileWalletOptions(options)` | Mobile wallet/deep-link choices |
| `getState()` | WalletConnect state |
| `getCurrentProvider()` | Retained active provider |
| `getAllInscriptions()` | Wallet inscription inventory |
| `getInscriptions(offset, limit)` | Paginated inscription inventory |
| `disconnect()` | Disconnect WalletConnect state |

---

## Repository examples

```text
example-simple.html
example-full.html
example-marketplace.html
bitmap-onchain-marketpace-example.html
README.md
```

For protocol/runtime caveats and the complete mobile wallet guidance, read the full `README.md`.
