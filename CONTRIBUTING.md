# Contributing

Thanks for taking a look. Issues and pull requests are both welcome.

## Getting set up

```bash
pnpm install
pnpm build      # packages resolve each other through their built entry points
pnpm test
pnpm example    # the demo app on http://localhost:5173
```

`pnpm build` before `pnpm typecheck` or the example: the workspace links
packages by their published entry points, not their source, so a stale `dist`
shows up as a type error in an unrelated package.

To try the swap views, copy `examples/vite-react/.env.example` to `.env.local`
and fill in what you have. Everything in it is optional — the features it
gates simply do not appear without it.

## Before opening a pull request

```bash
pnpm build && pnpm typecheck && pnpm test
```

CI runs exactly this on Node 18 and 22, plus a typecheck of the example.

## House style

- **Comments explain why, not what.** If a line needs a comment to say what it
  does, the line is usually the thing to fix. The comments worth writing are
  the ones that stop someone "simplifying" a deliberate choice.
- **Say what you verified.** A pull request that says "should fix the icons"
  is harder to review than one that says which chains were checked and how.
- **No new runtime dependency without a reason in the description.** This SDK
  exists partly to keep the dependency graph small.

## Chain and token data

`packages/chains/src/data/*.ts` is generated — edit
`packages/chains/scripts/generate.mjs` instead and re-run it. A logo that comes
out wrong is usually fixed with an entry in `ICON_OVERRIDES` rather than a code
change; the example app's "Logo audit" card exists to eyeball the result.

## Licensing

The project is MIT, and contributions are taken under MIT.

One exception: `packages/swap-widget` is GPL-3.0-or-later, because it wraps
`@dodoex/widgets`, which is. Contributions there are taken under GPL-3.0-or-later.
Nothing else in the repository depends on that package, and it should stay that
way — a GPL dependency reaching the core would relicense the whole SDK by
accident.

Bundled third-party data keeps its own copyright; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) before adding a new source.
