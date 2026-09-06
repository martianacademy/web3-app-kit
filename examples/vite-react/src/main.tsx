import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Web3AppKitProvider } from '@web3-app-kit/react'

import { App } from './App.js'
import { config } from './config.js'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Web3AppKitProvider
      config={config}
      modal={{
        // The page defines shadcn's theme variables, so the modal reads them
        // straight off `<html>` and follows the light/dark toggle for free.
        inheritHostTheme: true,
        termsUrl: 'https://example.com/terms',
        // The Swap entry is registered from React with `useSwapRequest`: the
        // widget behind it cannot render inside the modal's shadow root.
      }}
    >
      <App />
    </Web3AppKitProvider>
  </StrictMode>,
)
