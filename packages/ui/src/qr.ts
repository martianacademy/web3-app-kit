/**
 * Minimal QR Code encoder (byte mode, versions 1-40, all EC levels).
 *
 * Written in-package so the modal ships with zero runtime dependencies.
 * Implements ISO/IEC 18004: bitstream assembly, Reed-Solomon error
 * correction over GF(256) with primitive polynomial 0x11D, block
 * interleaving, function-pattern placement and the eight standard masks.
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H'

const EC_LEVEL_ORDER: Record<EcLevel, number> = { L: 0, M: 1, Q: 2, H: 3 }
/** Format-info bits use a different ordering than the table index. */
const EC_LEVEL_FORMAT_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }

// prettier-ignore
const EC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]

// prettier-ignore
const NUM_EC_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

export type QrMatrix = {
  /** Module count per side, including no quiet zone. */
  size: number
  version: number
  /** `true` means a dark module. Indexed `[y][x]`. */
  modules: boolean[][]
}

/** Encodes `text` as UTF-8 in byte mode and returns the module matrix. */
export function encodeQr(text: string, ecLevel: EcLevel = 'M'): QrMatrix {
  const data = new TextEncoder().encode(text)
  const version = pickVersion(data.length, ecLevel)
  const codewords = buildCodewords(data, version, ecLevel)
  return buildMatrix(codewords, version, ecLevel)
}

/** Renders a matrix as an SVG path `d` attribute, one `M h v h v z` per module. */
export function qrToPath(matrix: QrMatrix): string {
  const parts: string[] = []
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.modules[y]![x]) parts.push(`M${x} ${y}h1v1h-1z`)
  return parts.join('')
}

// ---------------------------------------------------------------------------
// Bitstream

function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16
}

function numDataCodewords(version: number, ecLevel: EcLevel): number {
  const level = EC_LEVEL_ORDER[ecLevel]
  const blocks = NUM_EC_BLOCKS[level]![version]!
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK[level]![version]!
  return Math.floor(rawDataModules(version) / 8) - ecPerBlock * blocks
}

/** Total data-carrying modules, i.e. everything but function patterns. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (version >= 7) result -= 36
  }
  return result
}

function pickVersion(byteLength: number, ecLevel: EcLevel): number {
  for (let version = 1; version <= 40; version++) {
    const capacityBits = numDataCodewords(version, ecLevel) * 8
    const neededBits = 4 + charCountBits(version) + byteLength * 8
    if (neededBits <= capacityBits) return version
  }
  throw new Error(`Data of ${byteLength} bytes does not fit in a QR code.`)
}

function buildCodewords(data: Uint8Array, version: number, ecLevel: EcLevel): number[] {
  const bits: number[] = []
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }

  append(0b0100, 4) // byte mode
  append(data.length, charCountBits(version))
  for (const byte of data) append(byte, 8)

  const capacityBits = numDataCodewords(version, ecLevel) * 8
  append(0, Math.min(4, capacityBits - bits.length)) // terminator
  append(0, (8 - (bits.length % 8)) % 8) // byte alignment
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8)

  const dataCodewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!
    dataCodewords.push(byte)
  }

  return interleaveBlocks(dataCodewords, version, ecLevel)
}

function interleaveBlocks(data: number[], version: number, ecLevel: EcLevel): number[] {
  const level = EC_LEVEL_ORDER[ecLevel]
  const numBlocks = NUM_EC_BLOCKS[level]![version]!
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK[level]![version]!
  const totalCodewords = Math.floor(rawDataModules(version) / 8)
  const numShortBlocks = numBlocks - (totalCodewords % numBlocks)
  const shortBlockLength = Math.floor(totalCodewords / numBlocks)

  const divisor = rsComputeDivisor(ecPerBlock)
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []

  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const length = shortBlockLength - ecPerBlock + (i < numShortBlocks ? 0 : 1)
    const block = data.slice(offset, offset + length)
    offset += length
    dataBlocks.push(block)
    ecBlocks.push(rsComputeRemainder(block, divisor))
  }

  const result: number[] = []
  const maxDataLength = shortBlockLength - ecPerBlock + 1
  for (let i = 0; i < maxDataLength; i++)
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]!)
  for (let i = 0; i < ecPerBlock; i++) for (const block of ecBlocks) result.push(block[i]!)

  return result
}

// ---------------------------------------------------------------------------
// Reed-Solomon over GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1

/** Multiplies two GF(256) field elements. Exported for tests. */
export function gfMultiply(a: number, b: number): number {
  let result = 0
  for (let i = 7; i >= 0; i--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d)
    result ^= ((b >>> i) & 1) * a
  }
  return result & 0xff
}

/** Coefficients of the degree-`degree` generator polynomial. Exported for tests. */
export function rsComputeDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j]!, root)
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

/** Error-correction codewords for `data`. Exported for tests. */
export function rsComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    for (let i = 0; i < divisor.length; i++)
      result[i] = result[i]! ^ gfMultiply(divisor[i]!, factor)
  }
  return result
}

// ---------------------------------------------------------------------------
// Module placement

function buildMatrix(codewords: number[], version: number, ecLevel: EcLevel): QrMatrix {
  const size = version * 4 + 17
  const modules: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  )
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  )

  const set = (x: number, y: number, dark: boolean) => {
    modules[y]![x] = dark
    isFunction[y]![x] = true
  }

  // Timing patterns
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }

  // Finder patterns with separators
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || x >= size || y < 0 || y >= size) continue
        set(x, y, distance !== 2 && distance !== 4)
      }
  }

  // Alignment patterns
  const centers = alignmentPatternCenters(version)
  for (let i = 0; i < centers.length; i++)
    for (let j = 0; j < centers.length; j++) {
      // Skip the three corners already occupied by finder patterns.
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      )
        continue
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(centers[j]! + dx, centers[i]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }

  // Reserve format-info modules (real bits are written after masking).
  drawFormatBits(modules, isFunction, size, ecLevel, 0, true)
  if (version >= 7) drawVersionBits(modules, isFunction, size, version)

  drawCodewords(modules, isFunction, size, codewords)

  let bestMask = 0
  let bestPenalty = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, isFunction, size, mask)
    drawFormatBits(modules, isFunction, size, ecLevel, mask, false)
    const penalty = penaltyScore(modules, size)
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      bestMask = mask
    }
    applyMask(modules, isFunction, size, mask) // XOR is its own inverse
  }

  applyMask(modules, isFunction, size, bestMask)
  drawFormatBits(modules, isFunction, size, ecLevel, bestMask, false)

  return { size, version, modules }
}

function alignmentPatternCenters(version: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const size = version * 4 + 17
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2
  const result = [6]
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos)
  return result
}

function drawFormatBits(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  ecLevel: EcLevel,
  mask: number,
  reserveOnly: boolean,
): void {
  const data = (EC_LEVEL_FORMAT_BITS[ecLevel] << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412

  const bit = (index: number) => (reserveOnly ? false : ((bits >>> index) & 1) !== 0)
  const set = (x: number, y: number, value: boolean) => {
    modules[y]![x] = value
    isFunction[y]![x] = true
  }

  // Top-left block
  for (let i = 0; i <= 5; i++) set(8, i, bit(i))
  set(8, 7, bit(6))
  set(8, 8, bit(7))
  set(7, 8, bit(8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))

  // Split block along the other two finders
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
  set(8, size - 8, true) // always-dark module
  isFunction[size - 8]![8] = true
}

function drawVersionBits(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  version: number,
): void {
  let rem = version
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  const bits = (version << 12) | rem

  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0
    const a = size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    modules[b]![a] = bit
    isFunction[b]![a] = true
    modules[a]![b] = bit
    isFunction[a]![b] = true
  }
}

function drawCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  codewords: number[],
): void {
  let index = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // the vertical timing pattern column is skipped
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (isFunction[y]![x] || index >= codewords.length * 8) continue
        modules[y]![x] = ((codewords[index >>> 3]! >>> (7 - (index & 7))) & 1) !== 0
        index++
      }
    }
  }
}

function applyMask(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  mask: number,
): void {
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (isFunction[y]![x]) continue
      let invert: boolean
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break
        case 1: invert = y % 2 === 0; break
        case 2: invert = x % 3 === 0; break
        case 3: invert = (x + y) % 3 === 0; break
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
        default: invert = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0; break
      }
      if (invert) modules[y]![x] = !modules[y]![x]
    }
}

function penaltyScore(modules: boolean[][], size: number): number {
  let result = 0
  const N1 = 3
  const N2 = 3
  const N3 = 40
  const N4 = 10

  const finderPattern = [true, false, true, true, true, false, true]
  const matchesFinder = (line: boolean[], start: number) => {
    for (let i = 0; i < 7; i++) if (line[start + i] !== finderPattern[i]) return false
    const before = line.slice(Math.max(0, start - 4), start)
    const after = line.slice(start + 7, start + 11)
    const quietBefore = before.length === 4 && before.every((v) => !v)
    const quietAfter = after.length === 4 && after.every((v) => !v)
    return (
      (quietBefore || start < 4) && (quietAfter || start + 11 > line.length) &&
      (quietBefore || quietAfter)
    )
  }

  const scoreLine = (line: boolean[]) => {
    let runColor = line[0]!
    let runLength = 1
    for (let i = 1; i < line.length; i++) {
      if (line[i] === runColor) {
        runLength++
        if (runLength === 5) result += N1
        else if (runLength > 5) result += 1
      } else {
        runColor = line[i]!
        runLength = 1
      }
    }
    for (let i = 0; i + 7 <= line.length; i++) if (matchesFinder(line, i)) result += N3
  }

  for (let y = 0; y < size; y++) scoreLine(modules[y]!.slice())
  for (let x = 0; x < size; x++) scoreLine(modules.map((row) => row[x]!))

  // 2x2 blocks of one colour
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y]![x]
      if (
        color === modules[y]![x + 1] &&
        color === modules[y + 1]![x] &&
        color === modules[y + 1]![x + 1]
      )
        result += N2
    }

  // Balance of dark modules
  let dark = 0
  for (const row of modules) for (const cell of row) if (cell) dark++
  const total = size * size
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
  result += Math.max(k, 0) * N4

  return result
}
