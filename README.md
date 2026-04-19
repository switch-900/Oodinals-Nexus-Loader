# Oodinals-Nexus Loader

A single Bitcoin inscription that gives you wallets, inscriptions, marketplace, and UTXOs.

**Sat:** `534764996708771`

```js
const { default: Nexus } = await import('/r/sat/534764996708771/at/-1/content');
```

No npm. No build tools. No dependencies to manage. One import and you're ready.

---

## How It Works

The Loader is an ES module inscribed on Bitcoin. When you import it, it automatically loads five on-chain dependencies (SHA256, secp256k1, SDK, Core, WalletConnect), initializes the Bitcoin library, and exports a ready-to-use `Nexus` object.

All URLs are root-relative (`/r/sat/...`) so they work on ordinals.com or any reverse proxy that serves the same paths.

---

## Import

### From an on-chain page (inscription or proxy)

```js
const { default: Nexus } = await import('/r/sat/534764996708771/at/-1/content');
```

The Loader makes API calls (UTXOs, fee rates, broadcasting) directly where possible. A popup-proxy window is only opened as a last resort when a direct request is blocked by the ordinals.com CSP — most calls will not require one.

### From an external site

Set the origin first, then import:

```js
window.__NEXUS_ORDINALS_ORIGIN__ = 'https://ordinals.com';
const { default: Nexus } = await import('https://ordinals.com/r/sat/534764996708771/at/-1/content');
```

### Named exports

```js
const { default: Nexus, NexusWalletConnect } = await import('/r/sat/534764996708771/at/-1/content');
```

`Nexus` is also available on `window.Nexus` after import.

---

## Connect a Wallet

```js
const wallet = await Nexus.connectWallet('unisat');
// wallet.address, wallet.paymentAddress, wallet.publicKey, ...
```

Supported wallets: `unisat`, `xverse`, `okx`, `leather`, `phantom`, `wizz`, `oyl`, `bitmapwallet`

```js
// Check which wallets the user has installed
const installed = Nexus.getInstalledWallets();
// [{ id: 'unisat', name: 'UniSat', icon: '🦄' }, ...]

// Get current state
const state = Nexus.getWalletState();
// { paymentAddress, ordinalsAddress, publicKey, paymentPublicKey, ... }

// Disconnect
await Nexus.disconnect();
```

---

## Create an Inscription

```js
const result = await Nexus.createInscription({
  feeRate: 10,
  items: [
    {
      content: 'Hello Bitcoin!',
      contentType: 'text/plain'
    }
  ]
});

console.log(result.commitTxId);
console.log(result.revealTxIds);
```

### Multiple items

```js
await Nexus.createInscription({
  feeRate: 10,
  defaults: {
    contentType: 'text/plain',
    metadata: { app: 'my-app' },
    properties: { collection: 'test' }
  },
  items: [
    { content: 'First', fileName: 'one.txt' },
    { content: 'Second', fileName: 'two.txt' },
    { content: 'Third', fileName: 'three.txt' }
  ]
});
```

### Base64 content (images, binary)

```js
await Nexus.createInscription({
  feeRate: 10,
  items: [{
    contentBase64: '<base64-encoded-data>',
    contentType: 'image/png'
  }]
});
```

### Parent-child inscriptions

```js
await Nexus.createInscription({
  feeRate: 10,
  defaults: {
    parentIds: ['<parent-inscription-id>']
  },
  items: [{ content: 'Child inscription', contentType: 'text/plain' }]
});
```

### Custom fees

```js
await Nexus.createInscription({
  feeRate: 10,
  fees: {
    developer: {
      enabled: true,
      address: 'bc1p...',
      amountSats: 1000
    },
    customFees: [
      { address: 'bc1p...', amountSats: 500, description: 'Platform fee' }
    ]
  },
  items: [{ content: 'Hello!', contentType: 'text/plain' }]
});
```

---

## Estimate Fees

Get a fee breakdown without triggering a wallet popup:

```js
const estimate = await Nexus.estimateFees({
  feeRate: 10,
  items: [{ content: 'Hello!', contentType: 'text/plain' }]
});

console.log(estimate.totalRequired); // sats needed
console.log(estimate.commitFee);
console.log(estimate.revealFee);
```

---

## Fee Rates

> **On-chain note:** `getFeeRate()` fetches live data directly. A popup window is only opened as a last resort if the direct request is blocked. In practice you can call it in the same flow as other methods — but if you don't need live rates, hardcoding `feeRate` in your JSON config is still the simplest option.

```js
// Separate button for fee rates (needs its own click)
const rates = await Nexus.getFeeRates();
// { fast: 42, medium: 20, slow: 10, minimum: 1 }

// Single rate
const feeRate = await Nexus.getFeeRate('medium');
```

Priority options: `'fast'`, `'medium'`, `'slow'`, `'minimum'`

---

## UTXOs

```js
const state = Nexus.getWalletState();

// Spendable only — returns a flat array of UTXOs safe to use as fee inputs
const utxos = await Nexus.getSpendableUtxos([state.paymentAddress]);

// Full classification — returns an object with categorised buckets
const classified = await Nexus.fetchSpendableUtxos([state.paymentAddress]);
// Returns: { spendable: [], unsafe: [], unconfirmed: [], inscriptions: [], runes: [], rareSats: [], fees, cached }

// Raw UTXOs (unfiltered, no classification)
const raw = await Nexus.fetchUtxos([state.paymentAddress]);
```

### Finding Inscriptions in UTXOs

```js
const utxos = await Nexus.fetchSpendableUtxos(address);
// Returns: { unsafe: [], spendable: [], unconfirmed: [] }
```

Users can filter UTXOs to control which outputs are used for fees:

- **`spendable`** — UTXOs that appear safe to spend (filters out ordinals and runes)
- **`unsafe`** — UTXOs that contain known inscriptions or other protected assets
- **`unconfirmed`** — UTXOs from unconfirmed transactions

> **Important:** The `spendable` filter uses ordinals standard detection, but things outside the standard may not be identified. Many wallets have built-in features to protect non-standard assets. You can let users manually select UTXOs to exclude from the spendable fee pool as an additional safety option.

---

## Validate JSON

Check a config before inscribing:

```js
try {
  Nexus.validateJson(jsonString);
  console.log('Valid');
} catch (e) {
  console.log('Invalid:', e.message);
}
```

---

## Marketplace

### Buy from a listing

```js
const state = Nexus.getWalletState();
const utxos = await Nexus.getSpendableUtxos([state.paymentAddress]);

// Buy by reveal txid
await Nexus.buyFromRevealTx({
  revealTxid: '<64-hex-txid>',
  buyerPaymentUtxos: utxos,
  buyerChangeAddress: state.paymentAddress,
  buyerReceiveAddress: state.ordinalsAddress,
  feeRateSatPerVb: 10,
  broadcast: true
});

// Or buy by inscription id
await Nexus.buyFromInscriptionId({
  inscriptionId: '<txid>i0',
  buyerPaymentUtxos: utxos,
  buyerChangeAddress: state.paymentAddress,
  buyerReceiveAddress: state.ordinalsAddress,
  feeRateSatPerVb: 10,
  broadcast: true
});
```

### Sell (list) an inscription

```js
const state = Nexus.getWalletState();
const utxos = await Nexus.getSpendableUtxos([state.paymentAddress]);

const marker = Nexus.applyPlatformSellerFeeToMarker({
  parentInscriptionId: '<inscription-id>',
  sellerAddress: state.paymentAddress,
  priceSats: BigInt(50000)
});

await Nexus.sellWith3TxFlow({
  parentUtxo: { txid: '...', vout: 0, value: 546, address: state.ordinalsAddress },
  fundingUtxo: utxos[0],
  fundingUtxos: utxos,
  sellerChangeAddress: state.paymentAddress,
  feeRateSatPerVb: 10,
  marker,
  broadcast: true,
  oodlFeeAddress: 'bc1p...',
  oodlFeeSats: 600
});
```

### Index listings

```js
const mp = Nexus.createMarketplaceClient({
  marketplaceFeeAddress: 'bc1p...',
  marketplaceFeeSats: 600
});

const page = await mp.getListingsPage({ pageSize: 25, cursorTxid: null });
console.log(page.listings);
console.log(page.nextCursorTxid); // pass to next call to paginate
```

---

## Collections

```js
await Nexus.loadCollectionsRegistry();

const collection = await Nexus.matchCollectionForInscription('<inscription-id>');
// returns collection key or null
```

---

## JSON Config Reference

The JSON object passed to `createInscription()` and `estimateFees()`:

```json
{
  "feeRate": 10,
  "network": "mainnet",
  "fees": {
    "developer": {
      "enabled": false,
      "address": "bc1p...",
      "amountSats": 1000
    },
    "customFees": [
      { "address": "bc1p...", "amountSats": 500, "description": "Label" }
    ]
  },
  "defaults": {
    "contentType": "text/plain",
    "metaprotocol": "",
    "metadata": {},
    "properties": {},
    "postage": 546,
    "parentIds": [],
    "contentEncoding": ""
  },
  "items": [
    {
      "content": "Hello!",
      "contentType": "text/plain",
      "fileName": "hello.txt",
      "contentBase64": null,
      "recipientAddress": null,
      "pointer": null,
      "delegateId": null,
      "parentIds": [],
      "metadata": {},
      "properties": {},
      "postage": 546,
      "repeatCount": 1
    }
  ]
}
```

All fields except `items[].content` (or `contentBase64`) are optional. Defaults are merged into each item.

---

## Method Reference

| Method | Description |
|--------|-------------|
| **Wallet** | |
| `connectWallet(type)` | Connect a Bitcoin wallet |
| `disconnect()` | Disconnect wallet |
| `getWalletState()` | Current wallet addresses and keys |
| `getInstalledWallets()` | List detected wallet extensions |
| **Inscriptions** | |
| `createInscription(config)` | Create inscription(s) from JSON config |
| `estimateFees(config)` | Fee estimate without wallet popup |
| `validateJson(config)` | Validate JSON config |
| **Fee Rates** | |
| `getFeeRates(network?)` | `{ fast, medium, slow, minimum }` in sat/vB |
| `getFeeRate(priority?, network?)` | Single fee rate |
| **UTXOs** | |
| `getSpendableUtxos(addresses)` | Flat array of spendable UTXOs (inscriptions/runes filtered out) |
| `fetchSpendableUtxos(addresses)` | Classified `{ spendable, unsafe, unconfirmed, inscriptions, runes, rareSats, fees, cached }` |
| `fetchUtxos(addresses)` | Raw unfiltered UTXOs |
| **Marketplace** | |
| `createMarketplaceClient(config)` | Listing indexer / paginator |
| `buyFromRevealTx(params)` | Buy listing by reveal txid |
| `buyFromInscriptionId(params)` | Buy listing by inscription id |
| `sellWith3TxFlow(params)` | Create a listing (3-tx flow) |
| `applyPlatformSellerFeeToMarker(params)` | Build sale marker with platform fee |
| **Collections** | |
| `loadCollectionsRegistry()` | Load on-chain collections registry |
| `matchCollectionForInscription(id)` | Match inscription to a collection |

---

## Minimal Full Example

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Nexus Demo</title></head>
<body>
  <button id="connect">Connect Wallet</button>
  <button id="inscribe" disabled>Inscribe</button>
  <pre id="out">Loading Nexus Loader…</pre>

  <script type="module">
    const { default: Nexus } = await import('/r/sat/534764996708771/at/-1/content');
    const out = document.getElementById('out');
    out.textContent = 'Ready. Click Connect Wallet.';

    document.getElementById('connect').onclick = async () => {
      try {
        out.textContent = 'Connecting…';
        await Nexus.connectWallet('unisat');
        out.textContent = 'Connected: ' + Nexus.getWalletState().ordinalsAddress;
        document.getElementById('inscribe').disabled = false;
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    };

    document.getElementById('inscribe').onclick = async () => {
      try {
        out.textContent = 'Creating inscription… approve in your wallet.';
        const result = await Nexus.createInscription({
          feeRate: 10,
          items: [{ content: 'Hello from Nexus!', contentType: 'text/plain' }]
        });
        out.textContent = JSON.stringify(result, null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    };
  </script>
</body>
</html>
```

---

## On-Chain Dependencies

The Loader imports these automatically. You never need to load them yourself.

| Module | Sat | URL |
|--------|-----|-----|
| SHA256 | `1550501128239335` | `/r/sat/1550501128239335/at/-1/content` |
| secp256k1 | `1550501128240727` | `/r/sat/1550501128240727/at/-1/content` |
| SDK | `534764996708111` | `/r/sat/534764996708111/at/-1/content` |
| Core | `534764996708441` | `/r/sat/534764996708441/at/-1/content` |
| WalletConnect | `534764996703784` | `/r/sat/534764996703784/at/1/content` |
