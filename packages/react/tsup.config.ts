import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'viem', '@web3-app-kit/core', '@web3-app-kit/ui', '@web3-app-kit/chains'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})
