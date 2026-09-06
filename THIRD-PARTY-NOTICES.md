# Third-party notices

`@web3-app-kit/chains` ships generated data — chain metadata, chain logos, token
logos and wallet logos — derived from the projects below. Each is MIT licensed,
and each keeps its own copyright: this project's MIT licence covers its own
code, not theirs.

## ethereum-lists/chains — MIT

Chain metadata (names, native currencies, RPC endpoints, explorers) in
`packages/chains/src/data/registry.ts`.

https://github.com/ethereum-lists/chains

## 0xa3k5/web3icons — MIT

Chain, token and wallet logos in `packages/chains/src/data/bundled-icons.ts`,
`icons.ts`, `token-icons.ts` and `wallet-icons.ts`, rendered to raster at build
time. The runtime CDN URLs point at the same project, pinned to a commit.

https://github.com/0xa3k5/web3icons

## trustwallet/assets — MIT

The Base chain logo, used as an override where the source above renders it
incorrectly.

https://github.com/trustwallet/assets

---

## Trademarks

The logos above are the trademarks of their respective owners. A software
licence grants no rights in a trademark: MetaMask's fox, Coinbase's mark,
Base's mark and every chain and token logo remain the property of whoever owns
them, and are included here so wallets and networks can be identified. If you
redistribute this package, that is on the same terms.

## `@web3-app-kit/swap-widget`

This one package is **GPL-3.0-or-later**, not MIT, because it is a wrapper
around `@dodoex/widgets`, which is GPL-3.0-or-later. It is published separately
and nothing else in this repository depends on it. See
`packages/swap-widget/LICENSE`.
