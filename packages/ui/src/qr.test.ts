import { describe, expect, it } from 'vitest'

import { encodeQr, gfMultiply, rsComputeDivisor, rsComputeRemainder } from './qr.js'

describe('reed-solomon', () => {
  it('multiplies in GF(256) with the QR primitive polynomial', () => {
    expect(gfMultiply(0, 5)).toBe(0)
    expect(gfMultiply(1, 5)).toBe(5)
    expect(gfMultiply(0x02, 0x80)).toBe(0x1d) // reduction by x^8 + x^4 + x^3 + x^2 + 1
    expect(gfMultiply(0x57, 0x83)).toBe(gfMultiply(0x83, 0x57)) // commutative
    // Every non-zero element of a field has a multiplicative inverse.
    for (const a of [0x01, 0x02, 0x53, 0x7f, 0xff]) {
      const inverse = [...Array(256).keys()].find((b) => gfMultiply(a, b) === 1)
      expect(inverse, `no inverse for 0x${a.toString(16)}`).toBeDefined()
    }
  })

  it('matches the ISO/IEC 18004 worked example for "01234567" at version 1-M', () => {
    // Annex I.2: the data codewords the spec derives for the sample message.
    const data = [
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
      0xec, 0x11,
    ]
    const ec = rsComputeRemainder(data, rsComputeDivisor(10))
    expect(ec).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55])
  })
})

describe('encodeQr', () => {
  it('picks the smallest version that fits and sizes the matrix correctly', () => {
    const small = encodeQr('hello', 'M')
    expect(small.version).toBe(1)
    expect(small.size).toBe(21)
    expect(small.modules).toHaveLength(21)
    expect(small.modules[0]).toHaveLength(21)
  })

  it('draws the three finder patterns', () => {
    const { modules, size } = encodeQr('hello', 'M')
    for (const [ox, oy] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ] as const) {
      // Outer ring dark, inner ring light, 3x3 core dark.
      expect(modules[oy]![ox]).toBe(true)
      expect(modules[oy + 1]![ox + 1]).toBe(false)
      expect(modules[oy + 3]![ox + 3]).toBe(true)
    }
  })

  it('draws the timing patterns', () => {
    const { modules, size } = encodeQr('hello', 'M')
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6]![i]).toBe(i % 2 === 0)
      expect(modules[i]![6]).toBe(i % 2 === 0)
    }
  })

  it('always sets the dark module', () => {
    const { modules, size } = encodeQr('hello', 'M')
    expect(modules[size - 8]![8]).toBe(true)
  })

  it('scales up for a realistic WalletConnect pairing URI', () => {
    const uri = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`
    const qr = encodeQr(uri, 'M')
    expect(qr.version).toBeGreaterThan(1)
    expect(qr.size).toBe(qr.version * 4 + 17)
  })

  it('handles multi-byte UTF-8 and long payloads', () => {
    expect(() => encodeQr('日本語のテキスト', 'M')).not.toThrow()
    expect(() => encodeQr('x'.repeat(2000), 'L')).not.toThrow()
  })
})
