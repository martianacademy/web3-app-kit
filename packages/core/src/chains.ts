/**
 * Re-export of viem's chain definitions so consumers do not need a second
 * import path. Tree-shaken: only the chains you reference end up in the bundle.
 */
export * from 'viem/chains'
