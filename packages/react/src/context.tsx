import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Config } from '@web3-app-kit/core'
import { createModal, type CreateModalParameters, type Modal } from '@web3-app-kit/ui'

export type ModalOptions = Omit<CreateModalParameters, 'config'>

export type Web3AppKitContextValue = {
  config: Config
  /** `null` until the modal mounts on the client, or when `modal={false}`. */
  modal: Modal | null
}

const Web3AppKitContext = createContext<Web3AppKitContextValue | null>(null)

export type Web3AppKitProviderProps = {
  config: Config
  /** Modal options, or `false` to run headless and build your own UI. */
  modal?: ModalOptions | false
  children: ReactNode
}

export function Web3AppKitProvider({
  config,
  modal: modalOptions,
  children,
}: Web3AppKitProviderProps) {
  const [modal, setModal] = useState<Modal | null>(null)

  // Options are read once per config. Theme changes are applied below instead
  // of tearing down and rebuilding the modal on every render.
  const optionsRef = useRef(modalOptions)
  optionsRef.current = modalOptions

  const disabled = modalOptions === false

  useEffect(() => {
    if (disabled) return
    const instance = createModal({ config, ...(optionsRef.current || {}) })
    setModal(instance)
    return () => {
      instance.destroy()
      setModal(null)
    }
  }, [config, disabled])

  const themeMode = modalOptions === false ? undefined : modalOptions?.themeMode
  const themeVariables = modalOptions === false ? undefined : modalOptions?.themeVariables
  const themeVariablesKey = JSON.stringify(themeVariables ?? {})

  useEffect(() => {
    if (!modal) return
    if (themeMode) modal.setThemeMode(themeMode)
    if (themeVariables) modal.setThemeVariables(themeVariables)
    // `themeVariablesKey` keeps the effect keyed on value, not identity.
  }, [modal, themeMode, themeVariablesKey, themeVariables])

  const value = useMemo<Web3AppKitContextValue>(() => ({ config, modal }), [config, modal])

  return createElement(Web3AppKitContext.Provider, { value }, children)
}

export function useWeb3AppKitContext(): Web3AppKitContextValue {
  const value = useContext(Web3AppKitContext)
  if (!value)
    throw new Error('`useWeb3AppKit` hooks must be used inside a <Web3AppKitProvider>.')
  return value
}

export function useConfig(): Config {
  return useWeb3AppKitContext().config
}
