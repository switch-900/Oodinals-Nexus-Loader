# Nexus and oodinals Loader — Quick Start

Import one inscription. Get wallets, inscriptions, marketplace, and UTXOs.

---

## 1. Import the Loader

```html
<script type="module">
  const { default: Nexus } = await import('/r/sat/534764996708771/at/-1/content');
</script>
```

That's it. No build tools, no npm, no dependencies. Everything loads automatically.

> **Tip:** If you're loading from a page hosted on ordinals.com, the root-relative `/r/sat/...` path works directly. From an external site, prefix with `https://ordinals.com`:
> ```js
> window.__NEXUS_ORDINALS_ORIGIN__ = 'https://ordinals.com';
> const { default: Nexus } = await import('https://ordinals.com/r/sat/534764996708771/at/-1/content');
> ```

---

## 2. Connect a Wallet

```js
const wallet = await Nexus.connectWallet('unisat');
// Supported: 'unisat', 'xverse', 'okx', 'leather', 'phantom', 'wizz', 'oyl', 'bitmapwallet'
```

Check which wallets are installed:

```js
const wallets = Nexus.getInstalledWallets();
// [{ id: 'unisat', name: 'UniSat', icon: '🦄' }, ...]
```

Get wallet state / disconnect:

```js
const state = Nexus.getWalletState();
// { paymentAddress, ordinalsAddress, publicKey, ... }

await Nexus.disconnect();
```

---

## 3. Create an Inscription

```js
const result = await Nexus.createInscription({
  feeRate: 10,
  items: [{
    content: btoa('Hello Bitcoin!'),
    contentType: 'text/plain;charset=utf-8'
  }]
});
console.log('Commit:', result.commitTxid);
console.log('Reveal:', result.revealTxids);
```

Estimate fees first (no wallet popup):

```js
const estimate = await Nexus.estimateFees({
  feeRate: 10,
  items: [{ content: btoa('Hello!'), contentType: 'text/plain;charset=utf-8' }]
});
console.log('Total needed:', estimate.totalRequired, 'sats');
```

Use live fee rates instead of hardcoding:

```js
const feeRate = await Nexus.getFeeRate('medium');
```

---

## 4. Buy from a Marketplace Listing

```js
const st = Nexus.getWalletState();
const utxos = await Nexus.getSpendableUtxos([st.paymentAddress]);

// By reveal txid (64-char hex)
await Nexus.buyFromRevealTx({
  revealTxid: '<64-hex-txid>',
  buyerPaymentUtxos: utxos,
  buyerChangeAddress: st.paymentAddress,
  buyerReceiveAddress: st.ordinalsAddress,
  feeRateSatPerVb: 10,
  broadcast: true
});

// Or by inscription id
await Nexus.buyFromInscriptionId({
  inscriptionId: '<txid>i0',
  buyerPaymentUtxos: utxos,
  buyerChangeAddress: st.paymentAddress,
  buyerReceiveAddress: st.ordinalsAddress,
  feeRateSatPerVb: 10,
  broadcast: true
});
```

---

## 5. List (Sell) an Inscription

```js
const st = Nexus.getWalletState();
const utxos = await Nexus.getSpendableUtxos([st.paymentAddress]);

const marker = Nexus.applyPlatformSellerFeeToMarker({
  parentInscriptionId: '<inscriptionId>',
  sellerAddress: st.paymentAddress,
  priceSats: BigInt(1500)
});

await Nexus.sellWith3TxFlow({
  parentUtxo: { txid: '...', vout: 0, value: 546, address: st.ordinalsAddress },
  fundingUtxo: utxos[0],
  fundingUtxos: utxos,
  sellerChangeAddress: st.paymentAddress,
  feeRateSatPerVb: 10,
  marker,
  broadcast: true,
  oodlFeeAddress: 'bc1p...',
  oodlFeeSats: 600
});
```

---

## 6. Index Marketplace Listings

```js
const mp = Nexus.createMarketplaceClient({
  marketplaceFeeAddress: 'bc1p...',
  marketplaceFeeSats: 600
});

const page = await mp.getListingsPage({ pageSize: 25, cursorTxid: null });
console.log(page.listings);       // Array of listings
console.log(page.nextCursorTxid); // Pass to next call to paginate
```

---

## Full Method Reference

| Method | Description |
|--------|-------------|
| `connectWallet(type)` | Connect a Bitcoin wallet |
| `disconnect()` | Disconnect wallet |
| `getWalletState()` | Current wallet addresses/keys |
| `getInstalledWallets()` | List detected wallet extensions |
| `createInscription(config)` | Create inscription(s) from JSON |
| `estimateFees(config)` | Estimate inscription fees |
| `validateJson(config)` | Validate inscription JSON |
| `getFeeRates(network?)` | Live fee rates `{ fast, medium, slow, minimum }` |
| `getFeeRate(priority?)` | Single fee rate (sat/vB) |
| `getSpendableUtxos(addrs)` | Spendable UTXOs (filters inscriptions/runes) |
| `fetchUtxos(addrs?)` | All raw UTXOs (unfiltered) |
| `fetchSpendableUtxos(addrs?)` | UTXOs classified as spendable/unsafe |
| `createMarketplaceClient(cfg)` | Marketplace listing indexer |
| `buyFromRevealTx(params)` | Buy by reveal txid |
| `buyFromInscriptionId(params)` | Buy by inscription id |
| `sellWith3TxFlow(params)` | Create listing (3-tx flow) |
| `applyPlatformSellerFeeToMarker(params)` | Build sale marker with platform fee |
| `loadCollectionsRegistry()` | Load on-chain collections registry |
| `matchCollectionForInscription(id)` | Match inscription to collection |

---

## Examples

- [`example-simple.html`](example-simple.html) — Minimal: connect + inscribe
- [`example-full.html`](example-full.html) — All features with UI
- [`example-marketplace.html`](example-marketplace.html) — Marketplace buy/sell

