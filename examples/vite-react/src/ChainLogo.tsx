import { useEffect, useState } from 'react'
import { useChainIconUrls } from '@web3-app-kit/react'

export type ChainLogoProps = {
  chainId?: number
  size?: number
}

/**
 * A chain logo that walks the gateway list on error. Public IPFS gateways pin
 * these images unevenly — a CID that times out on one usually resolves on the
 * next — so a single `<img src>` drops logos that are perfectly available.
 */
export function ChainLogo({ chainId, size = 28 }: ChainLogoProps) {
  const urls = useChainIconUrls(chainId)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [urls])

  const src = urls[index]
  if (!src) return <span className="logo-fallback" style={{ width: size, height: size }} />

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setIndex((current) => current + 1)}
    />
  )
}
