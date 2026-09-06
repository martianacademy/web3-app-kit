import { useState } from 'react'
import {
  ConnectButton,
  useAccount,
  useAppKit,
  useBalance,
  useConnectors,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
  useWalletInfo,
} from '@web3-app-kit/react'

import { ChainBrowser } from './ChainBrowser.js'
import { ChainLogo } from './ChainLogo.js'
import { LogoAudit } from './LogoAudit.js'
import { SwapDialog } from './SwapDialog.js'
import { ThemeToggle } from './ThemeToggle.js'

export function App() {
  const { address, chain, isConnected, connector, status } = useAccount()
  const { data: balance } = useBalance({ refetchInterval: 12_000 })
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()
  const { chains, switchChain, isPending: isSwitching } = useSwitchChain()
  const { signMessageAsync, data: signature, error: signError, isPending } = useSignMessage()
  const connectors = useConnectors()
  const { data: wallet } = useWalletInfo()
  const [message, setMessage] = useState('gm from web3-app-kit')

  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="brand">
            <strong>web3-app-kit</strong>
            <span>example</span>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <ConnectButton showBalance />
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-intro">
          <h1>Connect a wallet</h1>
          <p>
            An open-source SDK for EVM dApps — wallet discovery, a themeable modal, and metadata
            for every chain. Styled with shadcn/ui's default theme.
          </p>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>Connection</h2>
              <p>Live state from the config store.</p>
            </div>
            <div className="card-content">
              <dl>
                <dt>Status</dt>
                <dd>
                  <span className={`badge${isConnected ? ' badge--live' : ''}`}>{status}</span>
                </dd>
                <dt>Address</dt>
                <dd className="mono">{address ?? '—'}</dd>
                <dt>Chain</dt>
                <dd className="inline">
                  <ChainLogo size={18} />
                  {chain ? `${chain.name} (${chain.id})` : '—'}
                </dd>
                <dt>Balance</dt>
                <dd>{balance ? `${balance.formatted} ${balance.symbol}` : '—'}</dd>
                <dt>Wallet</dt>
                <dd className="inline">
                  {wallet?.icon && (
                    <img className="wallet-icon" src={wallet.icon} alt="" width={18} height={18} />
                  )}
                  {wallet?.name ?? '—'}
                </dd>
                <dt>Connector</dt>
                <dd>{connector?.name ?? '—'}</dd>
              </dl>
            </div>
            <div className="card-footer">
              <button className="btn btn--outline" onClick={() => open()}>
                Open modal
              </button>
              <button
                className="btn btn--outline"
                onClick={() => open({ view: 'Receive' })}
                disabled={!isConnected}
              >
                Receive
              </button>
              <button
                className="btn btn--outline"
                onClick={() => open({ view: 'Networks' })}
                disabled={!isConnected}
              >
                Switch network
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => disconnect()}
                disabled={!isConnected}
              >
                Disconnect
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Networks</h2>
              <p>Chains registered on this config.</p>
            </div>
            <div className="card-content">
              <div className="net-grid">
                {chains.map((candidate) => (
                  <button
                    key={candidate.id}
                    className="net-tile"
                    onClick={() => switchChain({ chainId: candidate.id })}
                    disabled={!isConnected || isSwitching || candidate.id === chain?.id}
                    aria-current={candidate.id === chain?.id}
                    title={candidate.name}
                  >
                    <span className="net-mark-wrap">
                      <ChainLogo chainId={candidate.id} size={52} />
                      {candidate.id === chain?.id && <span className="net-check" aria-hidden />}
                    </span>
                    <span className="net-name">{candidate.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Sign a message</h2>
              <p>Sends a `personal_sign` request to the connected wallet.</p>
            </div>
            <div className="card-content">
              <div className="row">
                <input
                  className="input"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-label="Message to sign"
                />
                <button
                  className="btn"
                  onClick={() => void signMessageAsync({ message }).catch(() => {})}
                  disabled={!isConnected || isPending}
                >
                  {isPending ? 'Signing…' : 'Sign'}
                </button>
              </div>
              {signature && <code className="output">{signature}</code>}
              {signError && <p className="error">{signError.message}</p>}
            </div>
          </section>

          <ChainBrowser />

          <LogoAudit />

          <section className="card">
            <div className="card-header">
              <h2>Detected connectors</h2>
              <p>Static connectors plus wallets found via EIP-6963.</p>
            </div>
            <div className="card-content">
              <ul className="connectors">
                {connectors.map((candidate) => (
                  <li key={candidate.id}>
                    <span>{candidate.name}</span>
                    <span className="badge">{candidate.type}</span>
                    {candidate.isAvailable?.() === false && (
                      <span className="muted">not installed</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>

      <SwapDialog />
    </>
  )
}
