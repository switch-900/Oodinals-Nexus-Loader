# Oodinals-Nexus Loader

A single on-chain Bitcoin loader for wallet connectivity, inscription creation, UTXO helpers, marketplace functions, collections, and chain/tree orchestration.

**Loader sat:** `534764996708771`

```js
const { default: Nexus } = await import('/r/sat/534764996708771/at/-1/content');
```

No npm. No build step. No package manager.

---

## How it works

The Loader is an ES module inscribed on Bitcoin. Importing it loads the on-chain dependency stack and exposes a ready-to-use `Nexus` object.

For on-chain applications, prefer root-relative paths:

```text
/content/<inscription-id>
/r/...
/r/sat/<sat>/at/-1/content
```

Do not hard-code `ordinals.com`, `0rdinals.com`, UniSat, or another explorer when the same resource is available from the current compatible host.

---

## Import

### From an on-chain page

```html
<script type="module">
  const { default: Nexus } =
    await import('/r/sat/534764996708771/at/-1/content');
</script>
```

### Named exports

```js
const {
  default: Nexus,
  NexusWalletConnect
} = await import('/r/sat/534764996708771/at/-1/content');
```

`Nexus` is also exposed on `window.Nexus` by the current loader.

### Sat-latest vs immutable pin

Latest inscription on the loader sat:

```js
const { default: Nexus } =
  await import('/r/sat/534764996708771/at/-1/content');
```

Immutable pin:

```js
const { default: Nexus } =
  await import('/content/<loader-inscription-id>');
```

Use sat-latest when you want upgrades. Pin an exact inscription when reproducibility matters.

### External website

External websites can explicitly choose an Ordinals-compatible origin:

```js
window.__NEXUS_ORDINALS_ORIGIN__ = 'https://ordinals.com';

const {
  default: Nexus,
  NexusWalletConnect
} = await import(
  'https://ordinals.com/r/sat/534764996708771/at/-1/content'
);
```

This is different from an on-chain inscription, where root-relative URLs are preferred.

---

## Connect a wallet

### Desktop / already inside a wallet browser

For an injected provider, the simple Loader API remains valid:

```js
const { default: Nexus } =
  await import('/r/sat/534764996708771/at/-1/content');

await Nexus.connectWallet('unisat');

const state = Nexus.getWalletState();
console.log(state.paymentAddress);
console.log(state.ordinalsAddress);
```

`Nexus.connectWallet()` is the simple provider connection path. In a normal mobile browser there may be **no injected wallet provider**, so mobile applications should use the named `NexusWalletConnect` export instead.

Supported wallet identifiers documented by the current loader:

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

### Mobile wallet apps and deep links

Import both Loader surfaces:

```js
const {
  default: Nexus,
  NexusWalletConnect
} = await import('/r/sat/534764996708771/at/-1/content');
```

The recommended mobile-aware method is:

```js
const result = await NexusWalletConnect.connectSmart(walletName, {
  targetUrl: location.href
});
```

`connectSmart()` behaves as follows:

- desktop: connect through the injected provider;
- wallet in-app browser: connect through the already injected provider;
- normal mobile browser: try the provider first, then fall back to the wallet's configured mobile deep link;
- on redirect it returns a result containing `redirected: true` and, when available, `deepLink`.

The caller must treat a redirect as a terminal result for that browser context. **Do not continue immediately into wallet-state, inscription-inventory, UTXO or signing calls after `redirected: true`.** The wallet app is opening/reloading the dApp.

### Complete Loader connection helper

```js
const {
  default: Nexus,
  NexusWalletConnect: NWC
} = await import('/r/sat/534764996708771/at/-1/content');

const WALLET_NAME_BY_ID = Object.freeze({
  bitmapwallet: 'BitmapWallet',
  unisat: 'UniSat',
  xverse: 'Xverse',
  okx: 'OKX',
  leather: 'Leather',
  phantom: 'Phantom',
  wizz: 'Wizz',
  oyl: 'Oyl'
});

async function connectWallet(walletId) {
  const id = String(walletId || '').trim().toLowerCase();
  const walletName = WALLET_NAME_BY_ID[id];
  if (!walletName) throw new Error(`Unsupported wallet: ${walletId}`);

  const targetUrl = location.href;
  let result;

  if (typeof NWC?.connectSmart === 'function') {
    result = await NWC.connectSmart(walletName, { targetUrl });

    if (result?.redirected) {
      // connectSmart/openMobileWallet normally performs this navigation itself.
      // Keeping the assignment is a safe compatibility fallback for loader revisions
      // that return the deep link without navigating.
      if (result.deepLink && location.href !== result.deepLink) {
        location.href = result.deepLink;
      }
      return { redirected: true, result };
    }
  } else if (typeof NWC?.connect === 'function') {
    result = await NWC.connect(walletName);
  } else if (typeof Nexus?.connectWallet === 'function') {
    result = await Nexus.connectWallet(id);
  } else {
    throw new Error('No Nexus wallet connection method is available');
  }

  // WalletConnect owns the live provider. Keep the Loader instance in sync as
  // well because createInscription/marketplace methods use the Loader wallet state.
  const loaderState = Nexus?.getWalletState?.();
  if (
    typeof Nexus?.connectWallet === 'function' &&
    !(loaderState?.isConnected === true || loaderState?.connected === true)
  ) {
    await Nexus.connectWallet(id);
  }

  const state =
    NWC?.getState?.() ||
    NWC?.getWalletState?.() ||
    Nexus?.getWalletState?.() ||
    {};

  const provider = NWC?.getCurrentProvider?.();

  if (!(state?.isConnected || state?.connected) || !provider) {
    throw new Error(
      'Wallet connected, but Nexus WalletConnect did not retain the active provider.'
    );
  }

  return { redirected: false, result, state, provider };
}
```

### Correct React / UI calling pattern

The caller must stop when a mobile redirect begins:

```js
const connected = await connectWallet(walletChoice);

if (connected?.redirected) {
  setWalletStatus(`Opening ${walletName(walletChoice)} app…`);
  return;
}

// Only run these after a real in-page connection exists.
const state = NWC.getState();
const inventory = await NWC.getAllInscriptions();
```

This early return is important. Starting `getState()`, `getAllInscriptions()`, UTXO discovery or profile validation in the original browser while the deep link is navigating can produce a false connection error even though the wallet app is opening correctly.

### Auto-reconnect after a mobile redirect

Call this early after importing the Loader:

```js
try {
  await NexusWalletConnect.tryMobileAutoReconnect?.();
} catch {}
```

Then read state normally:

```js
const state =
  NexusWalletConnect.getState?.() ||
  Nexus.getWalletState?.();

if (state?.isConnected || state?.connected) {
  console.log('Connected:', state.walletType, state.ordinalsAddress);
}
```

Do not make the application depend solely on auto-reconnect. The connection UI should still allow the user to choose the wallet again if the wallet browser does not restore the pending redirect context.

### Mobile wallet picker

The Loader re-exports the wallet-connect helpers through `NexusWalletConnect`:

```js
const {
  NexusWalletConnect: NWC
} = await import('/r/sat/534764996708771/at/-1/content');

const installed = NWC.detectWallets?.() || [];
const mobile = NWC.listMobileWalletOptions?.({
  targetUrl: location.href
}) || [];
```

The current wallet-connect module ships conservative mobile open-URL defaults for:

```text
UniSat
Xverse
Phantom
```

The current behavior is:

- **Xverse**: universal link opens the dApp URL in the Xverse browser;
- **Phantom**: universal link opens the dApp URL in the Phantom browser;
- **UniSat**: `unisat://request?...openDapp...` bridge opens the requested dApp URL;
- **OKX**: no default mobile deep link is shipped because behavior has varied across versions; configure it explicitly only after testing the target platform;
- other supported wallets can still connect when they inject a provider, or when an application supplies a tested custom deep-link configuration.

Do not hide all wallet choices simply because `detectWallets()` is empty on a phone. An empty injected-provider list is normal in a standard mobile browser.

### Custom mobile deep links

Runtime overrides are supported:

```js
window.NEXUS_MOBILE_WALLET_DEEPLINKS = {
  OKX: (targetUrl) =>
    `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(targetUrl)}`
};

window.NEXUS_MOBILE_WALLET_ALLOWED_SCHEMES = {
  OKX: ['okx', 'https']
};
```

Or use the wallet-connect helper when available:

```js
NexusWalletConnect.setMobileWalletDeepLinks?.({
  OKX: (targetUrl) =>
    `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(targetUrl)}`
});
```

Only configure links that have actually been verified for the wallet/platform version you support.

### Mobile wallet security requirements

The mobile wallet module validates the dApp target URL and generated wallet link. Applications should preserve those protections:

- pass an `http:` or `https:` dApp URL as `targetUrl`;
- do not build `javascript:`, `data:` or other executable deep links;
- prefer `connectSmart()` over hand-assembling wallet links;
- do not treat `{ redirected: true }` as a connected wallet;
- do not show ownership from stale wallet inventory before current on-chain ownership validation;
- keep wallet connection and deep-link navigation in the user's direct click/tap path.

### Relevant named WalletConnect methods

```text
connectSmart(walletName, options)
connectWithStrategy(walletName, options)
connect(walletName)
tryMobileAutoReconnect()
detectWallets()
listMobileWalletOptions(options)
probeConnectionMethods(walletName, options)
probeAllWallets()
getState()
getCurrentProvider()
getAllInscriptions()
getInscriptions(offset, limit)
disconnect()
```

For normal mobile dApps, `connectSmart()` is the preferred entry point.

### Loader import reference

```text
Nexus Loader      /r/sat/534764996708771/at/-1/content
WalletConnect     /r/sat/534764996703784/at/-1/content
```

The Loader exposes WalletConnect as the named export:

```js
const {
  default: Nexus,
  NexusWalletConnect
} = await import('/r/sat/534764996708771/at/-1/content');
```

### Detect installed providers

For desktop or wallet-browser provider detection:

```js
const installed = Nexus.getInstalledWallets();
console.log(installed);
```

On a normal mobile browser, an empty injected-provider list is expected and must not be used to hide wallets that can be opened through mobile deep links.

### Disconnect

Simple Loader disconnect:

```js
await Nexus.disconnect();
```

If your app is using the named WalletConnect surface directly, disconnect that surface as well when available:

```js
await NexusWalletConnect.disconnect?.();
await Nexus.disconnect?.();
```

### Wallet-provider injection caveat

Wallet extensions inject providers into the page.

Errors such as:

```text
Cannot redefine property: StacksProvider
at inpage.js
```

can be produced by competing injected wallet/provider scripts. Do not automatically treat such errors as Nexus failures. Check the source file and stack trace first.

---

## Create inscriptions

### Plain text

Pass plain text as plain text:

```js
const result = await Nexus.createInscription({
  feeRate: 10,
  items: [
    {
      content: 'Hello Bitcoin!',
      contentType: 'text/plain;charset=utf-8'
    }
  ]
});

console.log(result);
```

Do not use `btoa()` merely because the payload is being inscribed.

### Binary/base64 content

Use `contentBase64` when the payload is already represented as base64:

```js
await Nexus.createInscription({
  feeRate: 10,
  items: [
    {
      contentBase64: '<base64-encoded-png>',
      contentType: 'image/png',
      fileName: 'image.png'
    }
  ]
});
```

Keep the distinction clear:

```text
content       = normal string/text payload
contentBase64 = base64-encoded binary/base64 payload
```

### Multiple items

```js
await Nexus.createInscription({
  feeRate: 10,
  defaults: {
    contentType: 'text/plain;charset=utf-8',
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

### Sub-1 sat/vB

```js
await Nexus.createInscription({
  feeRate: 0.5,
  items: [
    {
      content: 'Hello Bitcoin!',
      contentType: 'text/plain;charset=utf-8'
    }
  ]
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
      {
        address: 'bc1p...',
        amountSats: 500,
        description: 'Label'
      }
    ]
  },
  items: [
    {
      content: 'Hello!',
      contentType: 'text/plain'
    }
  ]
});
```

### Platform fee override

The current API documentation supports overriding or disabling the platform fee per call:

```js
await Nexus.createInscription({
  feeRate: 10,
  platformFee: 5000,
  items: [
    {
      content: 'Hello!',
      contentType: 'text/plain'
    }
  ]
});
```

Disable for one call:

```js
await Nexus.createInscription({
  feeRate: 10,
  platformFee: 0,
  items: [
    {
      content: 'Hello!',
      contentType: 'text/plain'
    }
  ]
});
```

If your application depends on a particular fee constant, confirm the deployed loader version rather than assuming a long-lived hard-coded value.

---

## Parent-child inscriptions

`parentIds` associates a new inscription with parent inscription IDs.

A parent ID must be a complete inscription ID:

```text
<64-hex-txid>i0
```

Sequential example:

```js
const parentResult = await Nexus.createInscription({
  feeRate: 10,
  items: [
    {
      content: 'Parent',
      contentType: 'text/plain'
    }
  ]
});

const parentId =
  `${parentResult.revealTxIds[0]}i0`;

const childResult = await Nexus.createInscription({
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

const childId =
  `${childResult.revealTxIds[0]}i0`;

await Nexus.createInscription({
  feeRate: 10,
  defaults: {
    parentIds: [childId]
  },
  items: [
    {
      content: 'Grandchild',
      contentType: 'text/plain'
    }
  ]
});
```

### Parent metadata vs true transaction linkage

A parent tag and a transaction that actually spends the parent UTXO are not automatically the same thing.

If your design requires a true parent-UTXO relationship, ensure the transaction construction actually uses the intended parent UTXO.

Do not assume that putting one `parentIds` value on several batched items gives every item an independent true parent spend.

---

## Chain and tree orchestration

The current loader documents:

```text
createInscriptionTree(opts)
createInscriptionChain(opts)
```

Tree/DAG example:

```js
await Nexus.connectWallet('unisat');

const nodes = [
  {
    id: 'profile',
    items: [
      {
        content: 'Profile',
        contentType: 'text/plain'
      }
    ]
  },
  {
    id: 'branchA',
    parent: 'profile',
    items: [
      {
        content: 'Branch A',
        contentType: 'text/plain'
      }
    ]
  },
  {
    id: 'post1',
    parent: 'branchA',
    items: [
      {
        content: 'Post 1',
        contentType: 'text/plain'
      }
    ]
  }
];

const result = await Nexus.createInscriptionTree({
  nodes,
  feeRate: 10
});

console.log(result);
```

If the application can run in a normal mobile browser, complete the mobile-aware connection flow above before calling tree/chain or signing methods.

Runtime capability/version detection:

```js
console.log(Nexus.getCapabilities());
console.log(Nexus.getVersionInfo());
```

Use capability detection when following sat-latest dependencies.

---

## Estimate fees

```js
const estimate = await Nexus.estimateFees({
  feeRate: 10,
  items: [
    {
      content: 'Hello!',
      contentType: 'text/plain;charset=utf-8'
    }
  ]
});

console.log(estimate.totalRequired);
console.log(estimate.commitFee);
console.log(estimate.revealFee);
```

---

## Fee rates

```js
const rates = await Nexus.getFeeRates();

console.log(rates.fast);
console.log(rates.medium);
console.log(rates.slow);
console.log(rates.minimum);
```

Single tier:

```js
const feeRate = await Nexus.getFeeRate('medium');
```

Documented priority names:

```text
fast
medium
slow
minimum
```

### Popup/user-gesture caveat

The current loader may use a popup/proxy flow for operations that require external data under inscription CSP/browser restrictions.

If a method requires a popup, keep browser user-gesture restrictions in mind. Do not assume several unrelated popup-requiring actions can be triggered later from one stale click event.

---

## UTXOs

```js
const state = Nexus.getWalletState();

const spendable =
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

Do not bypass inscription/rune/rare-sat classification unless you explicitly intend to spend those assets.

---

## Marketplace

Buy by inscription ID:

```js
const state = Nexus.getWalletState();

const paymentUtxos =
  await Nexus.getSpendableUtxos([
    state.paymentAddress
  ]);

await Nexus.buyFromInscriptionId({
  inscriptionId: '<txid>i0',
  buyerPaymentUtxos: paymentUtxos,
  buyerChangeAddress: state.paymentAddress,
  buyerReceiveAddress: state.ordinalsAddress,
  feeRateSatPerVb: 10,
  broadcast: true
});
```

Buy by reveal transaction ID:

```js
await Nexus.buyFromRevealTx({
  revealTxid: '<64-hex-txid>',
  buyerPaymentUtxos: paymentUtxos,
  buyerChangeAddress: state.paymentAddress,
  buyerReceiveAddress: state.ordinalsAddress,
  feeRateSatPerVb: 10,
  broadcast: true
});
```

Create a listing:

```js
const marker =
  Nexus.applyPlatformSellerFeeToMarker({
    parentInscriptionId: '<inscription-id>',
    sellerAddress: state.paymentAddress,
    priceSats: BigInt(50000)
  });

await Nexus.sellWith3TxFlow({
  parentUtxo: {
    txid: '...',
    vout: 0,
    value: 546,
    address: state.ordinalsAddress
  },
  fundingUtxo: paymentUtxos[0],
  fundingUtxos: paymentUtxos,
  sellerChangeAddress: state.paymentAddress,
  feeRateSatPerVb: 10,
  marker,
  broadcast: true,
  oodlFeeAddress: 'bc1p...',
  oodlFeeSats: 600
});
```

Marketplace client:

```js
const marketplace =
  Nexus.createMarketplaceClient({
    marketplaceFeeAddress: 'bc1p...',
    marketplaceFeeSats: 600
  });

const page =
  await marketplace.getListingsPage({
    pageSize: 25,
    cursorTxid: null
  });

console.log(page.listings);
console.log(page.nextCursorTxid);
```

---

## Collections

```js
await Nexus.loadCollectionsRegistry();

const collection =
  await Nexus.matchCollectionForInscription(
    '<inscription-id>'
  );

console.log(collection);
```

`bitmap-onchain-marketpace-example.html` is a marketplace example. It should not be treated as the canonical definition of Bitmap first-claim validity.

---

## JSON configuration

The current documented shape includes:

```json
{
  "feeRate": 10,
  "network": "mainnet",
  "platformFee": 2000,
  "platformFeeAddress": "bc1p...",
  "fees": {
    "developer": {
      "enabled": false,
      "address": "bc1p...",
      "amountSats": 1000
    },
    "customFees": [
      {
        "address": "bc1p...",
        "amountSats": 500,
        "description": "Label"
      }
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

Minimal text:

```json
{
  "items": [
    {
      "content": "Hello from Nexus",
      "contentType": "text/plain"
    }
  ]
}
```

Minimal binary/base64:

```json
{
  "items": [
    {
      "contentBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
      "contentType": "image/png"
    }
  ]
}
```

Validation:

```js
try {
  Nexus.validateJson(jsonString);
  console.log('Valid');
} catch (error) {
  console.error('Invalid:', error.message);
}
```

---

# On-chain runtime and recursive content

This section records behaviour that matters when using Nexus in inscriptions, explorers, galleries, and recursive applications.

## Preserve the current host

Prefer:

```js
fetch('/r/blockheight');
fetch('/r/inscription/<id>');
fetch('/content/<id>');
```

over hard-coded explorer domains.

This keeps the application portable across compatible host environments.

## Preserve the real `/content/<id>` execution URL

Recursive HTML applications may inspect:

```js
location.href
location.pathname
document.baseURI
```

and may do:

```js
new URL('/content/<id>', location.href);
```

Running such an app from a synthetic URL such as:

```text
about:srcdoc
```

can break URL resolution, self-reference, recursive fetches, and module/resource loading.

For active recursive HTML, prefer execution from the real:

```text
/content/<inscription-id>
```

URL.

## MIME types need deliberate rendering

Do not send every content type through one generic iframe.

Recommended model:

| Content | Preferred handling |
|---|---|
| PNG/JPEG/GIF/WebP/APNG/AVIF/JXL | `<img>` |
| static SVG thumbnail | `<img src="/content/<id>">` |
| active/document SVG | sandboxed document |
| HTML/XHTML | sandboxed document |
| text/JSON/XML/YAML/TOML/JS | readable text renderer |
| video | `<video>` |
| audio | `<audio>` |
| PDF | document/PDF frame |
| font | explicit font handling/fallback |
| model | explicit model handling/fallback |
| unknown binary | safe raw-content fallback |

## SVG is not always a passive image

`image/svg+xml` can contain:

- scripts
- event handlers
- `foreignObject`
- imports
- external references
- CSS/resource URLs

For thumbnails, an `<img>` context is useful because scripts do not execute.

For an interactive full document, use a deliberate sandboxed document context.

## Sandbox trade-off

Active inscription HTML should be isolated.

Be careful with:

```text
sandbox="allow-scripts allow-same-origin"
```

for same-origin untrusted inscription content.

Adding `allow-same-origin` just to fix recursion can materially weaken the isolation boundary.

---

# Bitmap protocol notes

These rules matter for any Bitmap-aware Nexus application, indexer, marketplace, or renderer.

## Target block vs claim block

For:

```text
N.bitmap
```

`N` is the Bitcoin block being represented.

It is **not necessarily** the block in which the inscription was mined.

Keep these values separate:

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

but its geometry must still be generated from **Bitcoin block 969422**.

Do not render block `969426` merely because that is where the inscription was found.

## First-claim verification

For candidate `N.bitmap` found in block `H`:

### H < N

Invalid.

The target block did not yet exist.

### H = N

The first same-block candidate can be accepted under the loaded-chain verification model.

There is no eligible earlier block to search because `N.bitmap` cannot validly precede block `N`.

### H > N

Inspect every block:

```text
N
N + 1
...
H - 1
```

If an earlier `N.bitmap` exists, the candidate in `H` is not first.

If one or more required blocks have not been inspected, the state is:

```text
pending / unverified
```

not valid.

If the full proof window is known and contains no earlier claim, the candidate can become:

```text
valid / first proven claim
```

## Never search below N

The Bitmap proof window begins at the target block `N`.

Do not scan genesis through `N - 1` for an `N.bitmap` claim.

## Same-block duplicates

Preserve transaction/inscription ordering. If several `N.bitmap` claims occur in the same block, only the first relevant occurrence can be the first same-block candidate.

## Verification and rendering are separate

Do not conflate:

```text
verify candidate in claim block H
render geometry from target block N
```

The claim block proves where the candidate appeared.

The target block supplies the transaction/output geometry used by the Bitmap renderer.

## Cache both heights

Bitmap cache/index data should preserve:

```text
claim inscription ID
claim block H
target block N
validation state
```

Do not store one ambiguous `height` and reuse it for both verification and rendering.

---

# Debugging embedded/on-chain applications

Browser console errors may come from:

1. Nexus or your outer application
2. the embedded inscription
3. wallet/browser extensions
4. injected provider scripts
5. a third-party API used by the embedded inscription

## Wallet/provider example

```text
TypeError: Cannot redefine property: StacksProvider
at inpage.js
```

This can come from wallet/provider injection conflicts rather than Nexus.

## Embedded API example

```text
mempool.space returned 400
at btcapi.js
```

If `btcapi.js` belongs to the embedded inscription, the failing request is being made by that embedded app, not automatically by the outer Nexus application.

Inspect the stack trace before changing Nexus code.

Useful checks:

```js
console.log(location.href);
console.log(location.pathname);
console.log(document.baseURI);
```

Host endpoint:

```js
console.log(
  await fetch('/r/blockheight')
    .then(r => r.text())
);
```

Content endpoint:

```js
const response =
  await fetch('/content/<inscription-id>');

console.log(
  response.status,
  response.headers.get('content-type')
);
```

---

## Method reference

### Nexus Loader

| Method | Description |
|---|---|
| `connectWallet(type)` | Connect through an injected wallet provider |
| `disconnect()` | Disconnect Loader wallet state |
| `getWalletState()` | Current Loader wallet state |
| `getInstalledWallets()` | Detected injected wallet extensions/providers |
| `createInscription(config)` | Create inscription(s) |
| `createInscriptionTree(opts)` | Tree/DAG orchestration |
| `createInscriptionChain(opts)` | Chain orchestration |
| `estimateFees(config)` | Estimate inscription fees |
| `validateJson(config)` | Validate config |
| `getCapabilities()` | Runtime capability detection |
| `getVersionInfo()` | Version diagnostics |
| `getFeeRates(network?)` | Fee-rate tiers |
| `getFeeRate(priority?, network?)` | Selected fee rate |
| `getSpendableUtxos(addresses)` | Spendable UTXOs |
| `fetchSpendableUtxos(addresses?)` | Classified UTXOs |
| `fetchUtxos(addresses?)` | Raw UTXOs |
| `createMarketplaceClient(config)` | Marketplace client |
| `buyFromRevealTx(params)` | Buy by reveal txid |
| `buyFromInscriptionId(params)` | Buy by inscription ID |
| `sellWith3TxFlow(params)` | Listing/sale flow |
| `applyPlatformSellerFeeToMarker(params)` | Build listing/seller marker |
| `loadCollectionsRegistry()` | Load collection registry |
| `matchCollectionForInscription(id)` | Match inscription to collection |

### `NexusWalletConnect`

| Method | Description |
|---|---|
| `connectSmart(walletName, options)` | Preferred mobile-aware/provider-aware connection entry point |
| `connectWithStrategy(walletName, options)` | Connect using an explicit WalletConnect strategy |
| `connect(walletName)` | Connect by named wallet/provider |
| `tryMobileAutoReconnect()` | Attempt to restore a connection after a mobile deep-link handoff |
| `detectWallets()` | Detect injected providers |
| `listMobileWalletOptions(options)` | Return mobile wallet choices/deep-link options |
| `probeConnectionMethods(walletName, options)` | Probe methods for one wallet |
| `probeAllWallets()` | Probe supported wallets |
| `getState()` | Current WalletConnect state |
| `getCurrentProvider()` | Current retained provider |
| `getAllInscriptions()` | Wallet inscription inventory |
| `getInscriptions(offset, limit)` | Paginated wallet inscription inventory |
| `disconnect()` | Disconnect WalletConnect state |

---

## Minimal full example

This example is mobile-aware. It uses `connectSmart()` first, stops immediately when a mobile redirect begins, and synchronises the Loader state before inscription methods are enabled.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>Nexus Demo</title>
</head>
<body>
  <button id="connect">Connect UniSat</button>
  <button id="inscribe" disabled>Inscribe</button>
  <pre id="out">Loading Nexus…</pre>

  <script type="module">
    const {
      default: Nexus,
      NexusWalletConnect: NWC
    } = await import(
      '/r/sat/534764996708771/at/-1/content'
    );

    const out = document.getElementById('out');
    const connect = document.getElementById('connect');
    const inscribe = document.getElementById('inscribe');

    out.textContent = 'Ready. Connect a wallet.';

    // If this page has just been opened inside a wallet app, try to restore
    // the pending mobile handoff. The connect button remains available if
    // the wallet/browser does not restore the context automatically.
    try {
      await NWC?.tryMobileAutoReconnect?.();
    } catch {}

    connect.onclick = async () => {
      try {
        let result;

        if (typeof NWC?.connectSmart === 'function') {
          result = await NWC.connectSmart('UniSat', {
            targetUrl: location.href
          });

          if (result?.redirected) {
            out.textContent = 'Opening UniSat app…';

            if (result.deepLink && location.href !== result.deepLink) {
              location.href = result.deepLink;
            }

            return;
          }
        } else {
          await Nexus.connectWallet('unisat');
        }

        const loaderState = Nexus?.getWalletState?.();
        if (
          typeof Nexus?.connectWallet === 'function' &&
          !(loaderState?.isConnected || loaderState?.connected)
        ) {
          await Nexus.connectWallet('unisat');
        }

        const state =
          NWC?.getState?.() ||
          Nexus?.getWalletState?.() ||
          {};

        if (!(state?.isConnected || state?.connected)) {
          throw new Error('Wallet connection was not retained');
        }

        out.textContent =
          `Connected: ${state.ordinalsAddress || ''}`;

        inscribe.disabled = false;
      } catch (error) {
        out.textContent = `Error: ${error.message}`;
      }
    };

    inscribe.onclick = async () => {
      try {
        const result =
          await Nexus.createInscription({
            feeRate: 10,
            items: [
              {
                content: 'Hello from Nexus!',
                contentType: 'text/plain;charset=utf-8'
              }
            ]
          });

        out.textContent = JSON.stringify(result, null, 2);
      } catch (error) {
        out.textContent = `Error: ${error.message}`;
      }
    };
  </script>
</body>
</html>
```

---

## On-chain dependencies

The current repository documents:

| Module | Sat | Path |
|---|---:|---|
| SHA256 | `1550501128239335` | `/content/c3103d5df09f16f054315bb33dbfca12e09798c5de05b1978961fa6f8600aa5ei0` |
| secp256k1 | `1550501128240727` | `/content/c3103d5df09f16f054315bb33dbfca12e09798c5de05b1978961fa6f8600aa5ei1` |
| SDK | `534764996708111` | `/r/sat/534764996708111/at/-1/content` |
| Core | `534764996708441` | `/r/sat/534764996708441/at/-1/content` |
| WalletConnect | `534764996703784` | `/r/sat/534764996703784/at/-1/content` |

---

## Repository examples

- `example-simple.html`
- `example-full.html`
- `example-marketplace.html`
- `bitmap-onchain-marketpace-example.html`
- `QUICK-START.md`

---

## Design rules

1. Prefer root-relative on-chain URLs.
2. Preserve the real `/content/<id>` execution URL for recursive HTML.
3. Treat active HTML/SVG as untrusted document content.
4. Render MIME types deliberately.
5. Separate embedded-app errors from outer-app and wallet-extension errors.
6. Never confuse a Bitmap claim block with its target block.
7. Treat incomplete Bitmap proof as pending, not valid.
8. Use `getCapabilities()` / `getVersionInfo()` when following sat-latest.
9. Treat UTXO classification and signing as security-sensitive.
10. Pin exact inscription IDs when reproducibility matters.
11. Use `NexusWalletConnect.connectSmart()` for mobile-aware wallet entry and stop immediately on `{ redirected: true }`.
12. Do not hide mobile wallet choices only because no injected provider is detected.
