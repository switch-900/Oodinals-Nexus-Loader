# Oodinals-Nexus Loader - Quick Start

**Loader sat:** `534764996708771`

Import one on-chain loader for wallet connectivity, inscriptions, UTXO helpers, marketplace functions and related Nexus functionality.

---

## 1. Import the loader

From an on-chain inscription or compatible host:

```html
<script type="module">
  const { default: Nexus } =
    await import(
      '/r/sat/534764996708771/at/-1/content'
    );
</script>
```

No npm or build step is required.

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

const { default: Nexus } =
  await import(
    'https://ordinals.com/r/sat/534764996708771/at/-1/content'
  );
```

---

## 2. Connect a wallet

```js
await Nexus.connectWallet('unisat');

const state =
  Nexus.getWalletState();

console.log(state.paymentAddress);
console.log(state.ordinalsAddress);
```

Documented wallet IDs:

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

Detect installed wallets:

```js
console.log(
  Nexus.getInstalledWallets()
);
```

Disconnect:

```js
await Nexus.disconnect();
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

| Method | Description |
|---|---|
| `connectWallet(type)` | Connect wallet |
| `disconnect()` | Disconnect wallet |
| `getWalletState()` | Wallet state |
| `getInstalledWallets()` | Detected wallets |
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

---

## Repository examples

```text
example-simple.html
example-full.html
example-marketplace.html
bitmap-onchain-marketpace-example.html
README.md
```

For protocol/runtime caveats, read the full `README.md`.
