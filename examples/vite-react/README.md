# web3-app-kit — Vite + React example

Exercises the whole SDK: EIP-6963 discovery, connecting, chain switching,
message signing, balances, the modal, and a chain browser that searches all
2,725 EVM chains and adds the one you pick to the live config.

```bash
pnpm install
pnpm build           # build the packages first
pnpm example         # http://localhost:5173
```

WalletConnect is only registered when a project id is present:

```bash
cp .env.example .env
# VITE_WC_PROJECT_ID=... from https://dashboard.reown.com
```

Without one, injected wallets and Coinbase Wallet still work.

## Logo audit

The **Logo audit** section renders every chain logo the SDK can produce, so bad
upstream artwork is findable by eye — filter by name or id, toggle the hexagon
mask to inspect the raw artwork, and switch on *Compare sources* to see the
bundled, CDN and IPFS renditions of a chain side by side.

Found a wrong one? Note its chain id and pin it in `ICON_OVERRIDES` in
`packages/chains/scripts/generate.mjs`.

## Testing without a wallet extension

Announce a mock EIP-6963 provider from the browser console and it will appear in
the modal:

```js
const provider = {
  request: async ({ method }) =>
    method === 'eth_chainId' ? '0x1' : ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
  on() {}, removeListener() {},
}
window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
  detail: Object.freeze({
    info: { uuid: crypto.randomUUID(), name: 'Mock Wallet', icon: '', rdns: 'dev.mock.wallet' },
    provider,
  }),
}))
```
