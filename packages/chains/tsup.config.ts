import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,
  clean: true,
  // The generated datasets are dynamically imported, so code splitting keeps
  // them out of the entry chunk — apps only download what they ask for.
  splitting: true,
  treeshake: true,
  external: ['viem'],
})
