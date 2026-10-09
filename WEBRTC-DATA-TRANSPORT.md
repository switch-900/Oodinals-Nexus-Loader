# Nexus WebRTC address-history transport

**Verified on 9 October 2026 (live Ordinals-host browser):** In a clean-context check, before importing `/r/sat/534764996708771/at/-1/content`, both `window.NexusRelay?.request` and `window.NexusBitcoinProxy?.openPopup` were `undefined`, while `RTCPeerConnection` was available. After the import returned `LOADED`, `NexusRelay.request` and `NexusBitcoinProxy.openPopup` were both functions and `window.Nexus` was an object. An earlier live request through `NexusRelay.request('address-txs', ...)` returned **3 transactions** without invoking the popup method. The **current on-chain Nexus Loader import therefore makes the public WebRTC transport available** (possibly via one of its imported dependencies); no Loader code change or reinscription is required for that API. This does not prove that the returned history is complete or that the relay will be reachable in every browser/network.

## Why WebRTC first

An Ordinals inscription may not be able to fetch external Bitcoin API URLs because of its CSP. The newer Nexus frontend has a WebRTC DataChannel transport:

- `frontend/utils/api/relayClient.js`: actual DataChannel and request protocol.
- `frontend/utils/api/webrtcRelay.js`: publishes `window.NexusRelay` with `isAvailable()`, `request(action, params, timeoutMs)` and `connect()`.
- `frontend/utils/bitcoinProxyInit.js`: tries relay **before** the compatibility channel/popup for supported Bitcoin actions.
- `RELAY_CONFIG.md`: details relay configuration and supported actions.

The supported actions relevant to 0NS are **`address-txs`** (confirmed) and **`address-txs-mempool`** (unconfirmed). The result from the WebRTC `request` method is the transaction **array**. By contrast, the compatibility proxy `openPopup` response wraps it in `{data: [...]}`.

The relay server itself obtains upstream blockchain data. **This is not direct node access or consensus verification**; a transport change does not establish global name uniqueness or trust in the response.

## Quick audit of the actual on-chain JavaScript (WSL)

To see what is deployed **now**, rather than what is checked into the newer frontend repository, run these read-only commands from WSL:

```bash
mkdir -p /tmp/nexus-webrtc-audit

curl -fLsS --retry 2 --max-time 40 \
  'https://ordinals.com/r/sat/534764996708771/at/-1/content' \
  -o /tmp/nexus-webrtc-audit/loader.js

curl -fLsS --retry 2 --max-time 40 \
  'https://ordinals.com/r/sat/534764996708441/at/-1/content' \
  -o /tmp/nexus-webrtc-audit/core.js

wc -c /tmp/nexus-webrtc-audit/{loader,core}.js
sha256sum /tmp/nexus-webrtc-audit/{loader,core}.js

for f in /tmp/nexus-webrtc-audit/{loader,core}.js; do
  echo "===== $f ====="
  grep -oE 'NexusRelay|RTCPeerConnection|relayRequest|address-txs|initBitcoinProxy|openPopup' "$f" \
    | sort | uniq -c || true
done
```

This audits the **deployed source bytes**, but string matches alone are not proof that WebRTC actually opens or that the public `window.NexusRelay` API exists. Minified or bundled code might not retain the searched names. The runtime request below is the decisive check.

## Clean-context provenance check

On a **fresh** `https://ordinals.com/` browser tab (not the already-running 0NS app), open DevTools Console and run:

```js
(async () => {
  const before = {
    relay: typeof globalThis.NexusRelay?.request === 'function',
    proxy: typeof globalThis.NexusBitcoinProxy?.openPopup === 'function',
  };
  const module = await import('/r/sat/534764996708771/at/-1/content');
  const after = {
    loader: Boolean(module.default || module.Nexus),
    relay: typeof globalThis.NexusRelay?.request === 'function',
    proxy: typeof globalThis.NexusBitcoinProxy?.openPopup === 'function',
  };
  console.table({ before, after });
  if (!before.relay && after.relay) {
    console.log('CONFIRMED: importing Nexus made the relay API available on this page.');
  } else if (before.relay) {
    console.warn('Relay was present BEFORE import; provenance is ambiguous.');
  } else {
    console.warn('Loader did not expose NexusRelay on this page.');
  }
})().catch(console.error);
```

An onchain-host page with existing scripts can expose `NexusRelay` before this import; do not attribute that global to the Loader without checking its initial state.

## Verify the actual on-chain Loader (read-only, no popup requested)

Open an Ord-compatible page from the host you will use for 0NS, open DevTools Console and run:

```js
(async () => {
  const LOADER = '/r/sat/534764996708771/at/-1/content';
  const ADDRESS = 'bc1p0jhh0smr9u76xkly8ch343yu2fcgrp4xszzz3qte25v7sq0txqzssd32f5';
  await import(LOADER);
  const r = globalThis.NexusRelay;
  const p = globalThis.NexusBitcoinProxy;
  console.table({
    webRTC: typeof RTCPeerConnection === 'function',
    relayExposed: typeof r?.request === 'function',
    relayAvailable: r?.isAvailable?.() ?? null,
    relayDisabled: globalThis.__NEXUS_DISABLE_RELAY__ === true,
    compatibilityProxy: typeof p?.openPopup === 'function',
  });
  if (typeof r?.request !== 'function') {
    console.error('NOT EXPOSED: the on-chain Loader/Core does not publish NexusRelay. Do not claim WebRTC is available here.');
    return;
  }
  const start = performance.now();
  const history = await Promise.race([
    r.request('address-txs', {address: ADDRESS, network: 'mainnet'}, 20000),
    new Promise((_, reject) => setTimeout(() => reject(new Error('20-second relay timeout')), 20000)),
  ]);
  if (!Array.isArray(history)) throw new Error('Unexpected WebRTC history response type');
  console.log('WEBRTC PASS', {count: history.length, milliseconds: Math.round(performance.now() - start)});
})().catch(error => console.error('WEBRTC FAIL', error));
```

This requests public address history only: **no wallet connection, no signing, no broadcast, and no `openPopup` call**. It will not work unchanged from `file://` or a localhost/GitHub Pages origin lacking `/r/` routes. For a phone-friendly on-chain-host page, see [the standalone probe](examples/nexus-webrtc-probe.html).

A positive `relayAvailable` flag alone is not proof: the `WEBRTC PASS` request must succeed. `relayExposed: false` identifies a missing public API on that Loader build; the underlying proxy may still have its own internal WebRTC fast path.

## Use WebRTC first from a consumer app

```js
async function getNexusAddressHistory(address) {
  const r = globalThis.NexusRelay;
  if (typeof r?.request !== 'function') {
    throw new Error('This Nexus Loader does not expose the WebRTC relay.');
  }
  const txs = await r.request('address-txs', { address, network: 'mainnet' }, 20000);
  if (!Array.isArray(txs)) throw new Error('Nexus relay returned invalid history');
  return txs;
}
```

The newer 0NS SDK branch `sdk-hardening-20261009` tries this documented API first. By default it calls `NexusBitcoinProxy.openPopup` only when the relay is missing or fails (which itself may internally try WebRTC). To prevent visible popup fallback:

```js
const ns = ZeroNSSDK.createClient({ allowPopupFallback: false });
```

In that mode, unavailable relay data is an **error**, not an empty list or proof that a name is available.

## If the on-chain Loader does not expose it

The actual loader source is maintained under `switch-900/nexus-inscriber/sdk/nexus-loader.js`. In that source, the Loader imports its on-chain Nexus Core and calls `NexusCore.initBitcoinProxy()`. The **frontend** relay module lives at `frontend/utils/api/webrtcRelay.js`; it is not automatically provided by importing the current Loader. To add a supported public API without copying WebRTC logic into each app:

1. Reuse the already tested relay implementation as a separate **inscribable ES module** (resolve its Brotli decoder dependency and relative-import paths for the Ord host).
2. Import/initialise that module in the Nexus Loader, and expose a stable `Nexus.getBitcoinData(action, params)` or documented `NexusRelay.request` entry point.
3. Keep the compatibility proxy fallback only if permitted by the calling app; **do not** silently convert failed relay requests into empty history.
4. Verify it through this read-only probe on the same Ordinals host, then test 0NS discovery with `allowPopupFallback:false`.
5. Inscibe an updated **Nexus Loader** on its canonical sat if its runtime code actually changes. A GitHub commit alone does not update existing on-chain bytes. Record the new inscription ID and test it before describing WebRTC support as shipped.

Do not invent an on-chain `/content/<relay ID>` path before that relay module has been inscribed.

## Esplora pagination for registries and name services

**Important:** the standard `NexusRelay.request('address-txs', {address,network})` action fetches Esplora's first address-history page. It can return up to **25 confirmed** transactions and should **not** be treated as complete when an address has more activity. The Oodinals marketplace's `frontend/sdk/marketplace.js` implements the established Esplora cursor scheme: `/address/<address>/txs/chain/<lastTxid>` (the ID at the end of the previous confirmed page).

The existing Lumamesh Pion/WebRTC Bitcoin relay source (`switch-900/lumamesh/pion-server/bitcoin.go`) exposes a read-only `btc-get` action for allowlisted upstream domains. **That support is present in the source; it has not yet been individually tested against the currently deployed relay using the 0NS frontend.** It allows a caller to request Esplora's address summary and older confirmed pages through the existing WebRTC DataChannel, without a popup and without direct external fetch from the inscription:

```js
const address = 'bc1p0jhh0smr9u76xkly8ch343yu2fcgrp4xszzz3qte25v7sq0txqzssd32f5';
const relay = window.NexusRelay;

// Public, read-only Bitcoin data. No signing, no wallet or popup.
const stats = await relay.request('btc-get', {
  url: `https://blockstream.info/api/address/${address}`,
}, 20000);

const first = await relay.request('address-txs', {address,network:'mainnet'}, 20000);
const confirmed = first.filter(tx => tx.status?.confirmed === true);
if (confirmed.length && confirmed.length < stats.chain_stats.tx_count) {
  const lastTxid = confirmed.at(-1).txid;
  const older = await relay.request('btc-get', {
    url: `https://blockstream.info/api/address/${address}/txs/chain/${lastTxid}`,
  }, 20000);
  // Continue with older page cursors; validate against stats and detect loops.
}
```

For a **first-registration-wins** namespace (0NS), the consumer must compare the full confirmed count, reject duplicate or missing older pages, verify mempool status, and **fail closed** if any page or `btc-get` action fails. The OODL marketplace may display a recent-listings page even when older pages are unavailable, but doing so cannot safely establish namespace availability.

The current 0NS branch `sdk-hardening-20261009` includes these checks and exposes `client.historyStatus()`. Its HTML **Settings → Test WebRTC + index** tests this transport against the actual deployed relay before inscription. No Nexus Loader re-inscription is needed merely to add these consumer-side pagination calls, provided the deployed `btc-get` relay action succeeds.

## Current popup behaviour

A live read-only `NexusRelay.request('address-txs')` has returned three transactions in an Ordinals-host browser session. The older compatibility `openPopup` call **may** complete without a visible popup when Nexus Core has WebRTC enabled, but can fall through to a channel/popup. The direct `NexusRelay.request` path avoids that popup code. To prove this API is created by the on-chain Loader itself, repeat the probe in a fresh page and compare availability **before and after** the import.
