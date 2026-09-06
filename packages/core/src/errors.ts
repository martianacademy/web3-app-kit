/** Base class for every error thrown by this SDK. */
export class Web3AppKitError extends Error {
  override name = 'Web3AppKitError'
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

export class ConnectorNotFoundError extends Web3AppKitError {
  override name = 'ConnectorNotFoundError'
  constructor(id?: string) {
    super(
      id
        ? `Connector "${id}" is not registered on this config.`
        : 'No connector was provided and none is currently connected.',
    )
  }
}

export class ProviderNotFoundError extends Web3AppKitError {
  override name = 'ProviderNotFoundError'
  constructor(name = 'The wallet') {
    super(`${name} is not installed or did not expose an EIP-1193 provider.`)
  }
}

export class UserRejectedRequestError extends Web3AppKitError {
  override name = 'UserRejectedRequestError'
  constructor(options?: { cause?: unknown }) {
    super('The user rejected the request.', options)
  }
}

export class ChainNotConfiguredError extends Web3AppKitError {
  override name = 'ChainNotConfiguredError'
  constructor(chainId: number | string) {
    super(`Chain ${chainId} is not present in \`config.chains\`.`)
  }
}

export class SwitchChainNotSupportedError extends Web3AppKitError {
  override name = 'SwitchChainNotSupportedError'
  constructor(connectorName: string) {
    super(`"${connectorName}" does not support programmatic chain switching.`)
  }
}

export class NotConnectedError extends Web3AppKitError {
  override name = 'NotConnectedError'
  constructor() {
    super('No wallet is connected. Call `connect` first.')
  }
}

/** EIP-1193 / EIP-1474 codes that mean "the user said no". */
const USER_REJECTED_CODES = new Set([4001, 5000, -32603])

export function isUserRejectedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  if (typeof code === 'number' && USER_REJECTED_CODES.has(code)) {
    // -32603 is "internal error" and only counts when the message agrees.
    if (code !== -32603) return true
  }
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return false
  return /user (rejected|denied|cancell?ed)|rejected by user|request rejected/i.test(message)
}

/** Normalizes anything thrown by a provider into an `Error`. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'object' && value !== null && 'message' in value)
    return new Web3AppKitError(String((value as { message: unknown }).message), { cause: value })
  return new Web3AppKitError(String(value), { cause: value })
}
