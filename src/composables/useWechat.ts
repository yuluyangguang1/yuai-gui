/**
 * useWechat — iLink Protocol Client
 *
 * Implements the Tencent iLink HTTP JSON protocol for WeChat bot connectivity.
 * Handles login (QR code), messaging, media upload/download, and long-polling.
 */

// ── Constants ──

const LOGIN_BASE = 'https://ilinkai.weixin.qq.com'
const CDN_BASE = 'https://novac2c.cdn.weixin.qq.com/c2c'
const BOT_TYPE = '3'
const CHANNEL_VERSION = '1.0.11'

// ── Types ──

export interface WechatAccount {
  token: string
  baseUrl: string
  accountId: string
  userId: string
}

export interface WechatMessage {
  msgId: string
  fromUserId: string
  toUserId: string
  msgType: number
  content: string
  createTime: number
  contextToken?: string
}

export interface MediaItem {
  mediaId: string
  mediaType: number
  fileName?: string
  fileSize?: number
  aesKey?: string
}

export interface ParsedContent {
  text: string
  medias: MediaItem[]
}

// ── Crypto Helpers ──

/**
 * MD5 hex digest — minimal inline implementation (RFC 1321).
 * Returns lowercase hex string.
 */
export function md5hex(buf: Uint8Array): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3]

    a = ff(a, b, c, d, k[0], 7, -680876936)
    d = ff(d, a, b, c, k[1], 12, -389564586)
    c = ff(c, d, a, b, k[2], 17, 606105819)
    b = ff(b, c, d, a, k[3], 22, -1044525330)
    a = ff(a, b, c, d, k[4], 7, -176418897)
    d = ff(d, a, b, c, k[5], 12, 1200080426)
    c = ff(c, d, a, b, k[6], 17, -1473231341)
    b = ff(b, c, d, a, k[7], 22, -45705983)
    a = ff(a, b, c, d, k[8], 7, 1770035416)
    d = ff(d, a, b, c, k[9], 12, -1958414417)
    c = ff(c, d, a, b, k[10], 17, -42063)
    b = ff(b, c, d, a, k[11], 22, -1990404162)
    a = ff(a, b, c, d, k[12], 7, 1804603682)
    d = ff(d, a, b, c, k[13], 12, -40341101)
    c = ff(c, d, a, b, k[14], 17, -1502002290)
    b = ff(b, c, d, a, k[15], 22, 1236535329)

    a = gg(a, b, c, d, k[1], 5, -165796510)
    d = gg(d, a, b, c, k[6], 9, -1069501632)
    c = gg(c, d, a, b, k[11], 14, 643717713)
    b = gg(b, c, d, a, k[0], 20, -373897302)
    a = gg(a, b, c, d, k[5], 5, -701558691)
    d = gg(d, a, b, c, k[10], 9, 38016083)
    c = gg(c, d, a, b, k[15], 14, -660478335)
    b = gg(b, c, d, a, k[4], 20, -405537848)
    a = gg(a, b, c, d, k[9], 5, 568446438)
    d = gg(d, a, b, c, k[14], 9, -1019803690)
    c = gg(c, d, a, b, k[3], 14, -187363961)
    b = gg(b, c, d, a, k[8], 20, 1163531501)
    a = gg(a, b, c, d, k[13], 5, -1444681467)
    d = gg(d, a, b, c, k[2], 9, -51403784)
    c = gg(c, d, a, b, k[7], 14, 1735328473)
    b = gg(b, c, d, a, k[12], 20, -1926607734)

    a = hh(a, b, c, d, k[5], 4, -378558)
    d = hh(d, a, b, c, k[8], 11, -2022574463)
    c = hh(c, d, a, b, k[11], 16, 1839030562)
    b = hh(b, c, d, a, k[14], 23, -35309556)
    a = hh(a, b, c, d, k[1], 4, -1530992060)
    d = hh(d, a, b, c, k[4], 11, 1272893353)
    c = hh(c, d, a, b, k[7], 16, -155497632)
    b = hh(b, c, d, a, k[10], 23, -1094730640)
    a = hh(a, b, c, d, k[13], 4, 681279174)
    d = hh(d, a, b, c, k[0], 11, -358537222)
    c = hh(c, d, a, b, k[3], 16, -722521979)
    b = hh(b, c, d, a, k[6], 23, 76029189)
    a = hh(a, b, c, d, k[9], 4, -640364487)
    d = hh(d, a, b, c, k[12], 11, -421815835)
    c = hh(c, d, a, b, k[15], 16, 530742520)
    b = hh(b, c, d, a, k[2], 23, -995338651)

    a = ii(a, b, c, d, k[0], 6, -198630844)
    d = ii(d, a, b, c, k[7], 10, 1126891415)
    c = ii(c, d, a, b, k[14], 15, -1416354905)
    b = ii(b, c, d, a, k[5], 21, -57434055)
    a = ii(a, b, c, d, k[12], 6, 1700485571)
    d = ii(d, a, b, c, k[3], 10, -1894986606)
    c = ii(c, d, a, b, k[10], 15, -1051523)
    b = ii(b, c, d, a, k[1], 21, -2054922799)
    a = ii(a, b, c, d, k[8], 6, 1873313359)
    d = ii(d, a, b, c, k[15], 10, -30611744)
    c = ii(c, d, a, b, k[6], 15, -1560198380)
    b = ii(b, c, d, a, k[13], 21, 1309151649)
    a = ii(a, b, c, d, k[4], 6, -145523070)
    d = ii(d, a, b, c, k[11], 10, -1120210379)
    c = ii(c, d, a, b, k[2], 15, 718787259)
    b = ii(b, c, d, a, k[9], 21, -343485551)

    x[0] = add32(a, x[0])
    x[1] = add32(b, x[1])
    x[2] = add32(c, x[2])
    x[3] = add32(d, x[3])
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t))
    return add32((a << s) | (a >>> (32 - s)), b)
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t)
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t)
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t)
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t)
  }

  function md51(buf: Uint8Array): number[] {
    const n = buf.length
    let state = [1732584193, -271733879, -1732584194, 271733878]
    let i: number
    for (i = 64; i <= n; i += 64) {
      md5cycle(state, md5blk(buf.subarray(i - 64, i)))
    }
    const tail = buf.subarray(i - 64)
    const tailArr = new Array<number>(16).fill(0)
    for (let j = 0; j < tail.length; j++) {
      tailArr[j >> 2] |= tail[j] << ((j % 4) << 3)
    }
    tailArr[tail.length >> 2] |= 0x80 << ((tail.length % 4) << 3)
    if (tail.length > 55) {
      md5cycle(state, tailArr)
      for (let j = 0; j < 16; j++) tailArr[j] = 0
    }
    tailArr[14] = n * 8
    md5cycle(state, tailArr)
    return state
  }

  function md5blk(buf: Uint8Array) {
    const md5blks = new Array<number>(16)
    for (let j = 0; j < 64; j += 4) {
      md5blks[j >> 2] = buf[j] + (buf[j + 1] << 8) + (buf[j + 2] << 16) + (buf[j + 3] << 24)
    }
    return md5blks
  }

  const hex_chr = '0123456789abcdef'.split('')

  function rhex(n: number) {
    let s = ''
    for (let j = 0; j < 4; j++) {
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f]
    }
    return s
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff
  }

  const result = md51(buf)
  return result.map(rhex).join('')
}

/**
 * AES-128-ECB encryption (inline implementation).
 * Web Crypto API does not support ECB mode, so we implement it manually.
 */
export function aesEncryptEcb(plain: Uint8Array, key: Uint8Array): Uint8Array {
  // PKCS7 padding
  const blockSize = 16
  const padLen = blockSize - (plain.length % blockSize)
  const padded = new Uint8Array(plain.length + padLen)
  padded.set(plain)
  for (let i = plain.length; i < padded.length; i++) {
    padded[i] = padLen
  }

  const result = new Uint8Array(padded.length)
  const expandedKey = aesKeyExpansion(key)

  for (let i = 0; i < padded.length; i += 16) {
    const block = padded.subarray(i, i + 16)
    const encrypted = aesEncryptBlock(block, expandedKey)
    result.set(encrypted, i)
  }

  return result
}

/**
 * AES-128-ECB decryption (inline implementation).
 */
export function aesDecryptEcb(cipher: Uint8Array, key: Uint8Array): Uint8Array {
  const expandedKey = aesKeyExpansion(key)
  const result = new Uint8Array(cipher.length)

  for (let i = 0; i < cipher.length; i += 16) {
    const block = cipher.subarray(i, i + 16)
    const decrypted = aesDecryptBlock(block, expandedKey)
    result.set(decrypted, i)
  }

  // Remove PKCS7 padding
  if (result.length > 0) {
    const padLen = result[result.length - 1]
    if (padLen > 0 && padLen <= 16) {
      return result.subarray(0, result.length - padLen)
    }
  }

  return result
}

// AES S-Box
const SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]

// Inverse S-Box
const INV_SBOX = [
  0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
  0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
  0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
  0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
  0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
  0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
  0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
  0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
  0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
  0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
  0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
  0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
  0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
  0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
  0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
  0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d,
]

// Round constants
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]

function gmul(a: number, b: number): number {
  let p = 0
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a
    const hi = a & 0x80
    a = (a << 1) & 0xff
    if (hi) a ^= 0x1b
    b >>= 1
  }
  return p
}

function aesKeyExpansion(key: Uint8Array): Uint8Array {
  const expandedKey = new Uint8Array(176) // 11 * 16
  expandedKey.set(key)

  for (let i = 4; i < 44; i++) {
    const temp = expandedKey.subarray((i - 1) * 4, i * 4).slice()

    if (i % 4 === 0) {
      // RotWord
      const t0 = temp[0]
      temp[0] = SBOX[temp[1]]
      temp[1] = SBOX[temp[2]]
      temp[2] = SBOX[temp[3]]
      temp[3] = SBOX[t0]
      temp[0] ^= RCON[(i / 4) - 1]
    }

    for (let j = 0; j < 4; j++) {
      expandedKey[i * 4 + j] = expandedKey[(i - 4) * 4 + j] ^ temp[j]
    }
  }

  return expandedKey
}

function subBytes(state: Uint8Array) {
  for (let i = 0; i < 16; i++) {
    state[i] = SBOX[state[i]]
  }
}

function invSubBytes(state: Uint8Array) {
  for (let i = 0; i < 16; i++) {
    state[i] = INV_SBOX[state[i]]
  }
}

function shiftRows(state: Uint8Array) {
  const temp = new Uint8Array(16)
  temp.set(state)
  // Row 0: no shift
  // Row 1: shift left 1
  state[1] = temp[5]; state[5] = temp[9]; state[9] = temp[13]; state[13] = temp[1]
  // Row 2: shift left 2
  state[2] = temp[10]; state[6] = temp[14]; state[10] = temp[2]; state[14] = temp[6]
  // Row 3: shift left 3
  state[3] = temp[15]; state[7] = temp[3]; state[11] = temp[7]; state[15] = temp[11]
}

function invShiftRows(state: Uint8Array) {
  const temp = new Uint8Array(16)
  temp.set(state)
  // Row 0: no shift
  // Row 1: shift right 1
  state[13] = temp[9]; state[9] = temp[5]; state[5] = temp[1]; state[1] = temp[13]
  // Row 2: shift right 2
  state[10] = temp[2]; state[14] = temp[6]; state[2] = temp[10]; state[6] = temp[14]
  // Row 3: shift right 3
  state[7] = temp[11]; state[11] = temp[15]; state[15] = temp[3]; state[3] = temp[7]
}

function mixColumns(state: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4
    const a0 = state[i], a1 = state[i + 1], a2 = state[i + 2], a3 = state[i + 3]
    state[i]     = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3
    state[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3
    state[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3)
    state[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2)
  }
}

function invMixColumns(state: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4
    const a0 = state[i], a1 = state[i + 1], a2 = state[i + 2], a3 = state[i + 3]
    state[i]     = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9)
    state[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13)
    state[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11)
    state[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14)
  }
}

function addRoundKey(state: Uint8Array, expandedKey: Uint8Array, round: number) {
  for (let i = 0; i < 16; i++) {
    state[i] ^= expandedKey[round * 16 + i]
  }
}

function aesEncryptBlock(block: Uint8Array, expandedKey: Uint8Array): Uint8Array {
  const state = new Uint8Array(block)

  addRoundKey(state, expandedKey, 0)

  for (let round = 1; round < 10; round++) {
    subBytes(state)
    shiftRows(state)
    mixColumns(state)
    addRoundKey(state, expandedKey, round)
  }

  subBytes(state)
  shiftRows(state)
  addRoundKey(state, expandedKey, 10)

  return state
}

function aesDecryptBlock(block: Uint8Array, expandedKey: Uint8Array): Uint8Array {
  const state = new Uint8Array(block)

  addRoundKey(state, expandedKey, 10)

  for (let round = 9; round > 0; round--) {
    invShiftRows(state)
    invSubBytes(state)
    addRoundKey(state, expandedKey, round)
    invMixColumns(state)
  }

  invShiftRows(state)
  invSubBytes(state)
  addRoundKey(state, expandedKey, 0)

  return state
}

// ── HTTP Helpers ──

function commonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'iLink-App-ClientVersion': '65536',
  }
}

function postHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...commonHeaders(),
    'AuthorizationType': 'ilink_bot_token',
    'X-WECHAT-UIN': btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }
  if (token) {
    headers['Authorization'] = token
  }
  return headers
}

function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// ── Login Flow ──

/**
 * Fetch a new QR code for bot login.
 * Returns {qrcode, qrcode_img_content} where qrcode_img_content is a base64 image.
 */
export async function fetchQrcode(): Promise<{ qrcode: string; qrcode_img_content: string }> {
  const url = `${LOGIN_BASE}/ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: commonHeaders(),
    body: JSON.stringify({}),
  })

  if (!resp.ok) {
    throw new Error(`fetchQrcode failed: ${resp.status} ${resp.statusText}`)
  }

  const data = await resp.json()
  if (data.errcode !== 0) {
    throw new Error(`fetchQrcode error: ${data.errmsg ?? 'unknown'}`)
  }

  return {
    qrcode: data.qrcode,
    qrcode_img_content: data.qrcode_img_content ?? '',
  }
}

/**
 * Poll QR code status until scanned/confirmed.
 * Returns the full status response including baseUrl, token, etc.
 */
export async function pollQrStatus(
  baseUrl: string,
  qrcode: string,
  verifyCode?: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ qrcode })
  if (verifyCode) params.set('verify_code', verifyCode)

  const url = `${baseUrl}/ilink/bot/get_qrcode_status?${params.toString()}`

  const resp = await fetch(url, {
    method: 'GET',
    headers: commonHeaders(),
  })

  if (!resp.ok) {
    throw new Error(`pollQrStatus failed: ${resp.status} ${resp.statusText}`)
  }

  return await resp.json()
}

// ── Messaging ──

/**
 * Long-poll for updates (messages) from WeChat.
 * Blocks for up to timeoutMs (default 35s).
 */
export async function getUpdates(
  account: WechatAccount,
  buf?: string,
  timeoutMs = 35000,
  signal?: AbortSignal,
): Promise<{ messages: WechatMessage[]; buf: string }> {
  const url = `${account.baseUrl}/ilink/bot/getupdates`

  const resp = await fetch(url, {
    method: 'POST',
    headers: postHeaders(account.token),
    body: JSON.stringify({
      buf: buf ?? '',
      timeout: Math.floor(timeoutMs / 1000),
    }),
    signal,
  })

  if (!resp.ok) {
    throw new Error(`getUpdates failed: ${resp.status} ${resp.statusText}`)
  }

  const data = await resp.json()
  if (data.errcode !== 0) {
    throw new Error(`getUpdates error: ${data.errmsg ?? 'unknown'} (code: ${data.errcode})`)
  }

  const messages: WechatMessage[] = (data.updates ?? []).map((u: Record<string, unknown>) => ({
    msgId: u.msgid as string ?? '',
    fromUserId: u.from_username as string ?? '',
    toUserId: u.to_username as string ?? '',
    msgType: u.msg_type as number ?? 0,
    content: u.content as string ?? '',
    createTime: u.create_time as number ?? 0,
    contextToken: u.context_token as string ?? undefined,
  }))

  return {
    messages,
    buf: data.buf ?? buf ?? '',
  }
}

/**
 * Send a text message to a WeChat contact.
 */
export async function sendText(
  account: WechatAccount,
  toUserId: string,
  text: string,
  contextToken?: string,
): Promise<void> {
  const url = `${account.baseUrl}/ilink/bot/sendmessage`

  const body: Record<string, unknown> = {
    to_username: toUserId,
    msg_type: 1,
    content: text,
    nonce_str: generateNonce(),
  }
  if (contextToken) {
    body.context_token = contextToken
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: postHeaders(account.token),
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    throw new Error(`sendText failed: ${resp.status} ${resp.statusText}`)
  }

  const data = await resp.json()
  if (data.errcode !== 0) {
    throw new Error(`sendText error: ${data.errmsg ?? 'unknown'}`)
  }
}

/**
 * Send typing indicator.
 */
export async function sendTyping(
  account: WechatAccount,
  userId: string,
  on: boolean,
): Promise<void> {
  const url = `${account.baseUrl}/ilink/bot/sendtyping`

  const resp = await fetch(url, {
    method: 'POST',
    headers: postHeaders(account.token),
    body: JSON.stringify({
      to_username: userId,
      typing: on ? 1 : 0,
    }),
  })

  if (!resp.ok) {
    throw new Error(`sendTyping failed: ${resp.status}`)
  }
}

/**
 * Ping the server to check connection validity.
 */
export async function ping(account: WechatAccount): Promise<boolean> {
  const url = `${account.baseUrl}/ilink/bot/getconfig`

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: postHeaders(account.token),
      body: JSON.stringify({}),
    })

    if (!resp.ok) return false

    const data = await resp.json()
    return data.errcode === 0
  } catch {
    return false
  }
}

// ── Media ──

/**
 * Send a media file (image/video/file) to a WeChat contact.
 * 3-step process: getuploadurl → CDN upload → sendmessage
 */
export async function sendMedia(
  account: WechatAccount,
  toUserId: string,
  filePath: string,
  fileName: string,
  fileData: Uint8Array,
  contextToken?: string,
): Promise<void> {
  // Step 1: Get upload URL
  const uploadUrl = `${account.baseUrl}/ilink/bot/getuploadurl`
  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: postHeaders(account.token),
    body: JSON.stringify({
      to_username: toUserId,
      file_name: fileName,
      file_size: fileData.length,
      file_type: getMediaType(fileName),
    }),
  })

  if (!uploadResp.ok) {
    throw new Error(`getuploadurl failed: ${uploadResp.status}`)
  }

  const uploadData = await uploadResp.json()
  if (uploadData.errcode !== 0) {
    throw new Error(`getuploadurl error: ${uploadData.errmsg ?? 'unknown'}`)
  }

  const cdnUploadUrl = uploadData.upload_url ?? uploadData.url
  const mediaId = uploadData.media_id ?? ''
  const aesKey = uploadData.aes_key ?? ''

  // Step 2: CDN upload with AES-128-ECB encryption
  const keyBytes = typeof aesKey === 'string' && aesKey.length > 0
    ? new TextEncoder().encode(aesKey.substring(0, 16))
    : crypto.getRandomValues(new Uint8Array(16))

  const encrypted = aesEncryptEcb(fileData, keyBytes)

  const cdnResp = await fetch(cdnUploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-MD5': md5hex(fileData),
    },
    body: encrypted,
  })

  if (!cdnResp.ok) {
    throw new Error(`CDN upload failed: ${cdnResp.status}`)
  }

  // Step 3: Send message with media
  const sendUrl = `${account.baseUrl}/ilink/bot/sendmessage`
  const msgBody: Record<string, unknown> = {
    to_username: toUserId,
    msg_type: getMsgTypeForMedia(fileName),
    media_id: mediaId,
    nonce_str: generateNonce(),
  }
  if (contextToken) {
    msgBody.context_token = contextToken
  }

  const sendResp = await fetch(sendUrl, {
    method: 'POST',
    headers: postHeaders(account.token),
    body: JSON.stringify(msgBody),
  })

  if (!sendResp.ok) {
    throw new Error(`sendMedia message failed: ${sendResp.status}`)
  }

  const sendData = await sendResp.json()
  if (sendData.errcode !== 0) {
    throw new Error(`sendMedia error: ${sendData.errmsg ?? 'unknown'}`)
  }
}

/**
 * Download a media file from CDN and decrypt it.
 */
export async function downloadMedia(
  item: MediaItem,
  destDir: string,
): Promise<{ fileName: string; data: Uint8Array }> {
  const url = `${CDN_BASE}/download?media_id=${encodeURIComponent(item.mediaId)}`

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`downloadMedia failed: ${resp.status}`)
  }

  const encrypted = new Uint8Array(await resp.arrayBuffer())

  let data: Uint8Array
  if (item.aesKey) {
    const keyBytes = new TextEncoder().encode(item.aesKey.substring(0, 16))
    data = aesDecryptEcb(encrypted, keyBytes)
  } else {
    data = encrypted
  }

  const fileName = item.fileName ?? `media_${item.mediaId.substring(0, 8)}`
  return { fileName, data }
}

/**
 * Extract text content and media items from a WeChat message.
 */
export function contentFromMsg(msg: WechatMessage): ParsedContent {
  const text = msg.content ?? ''
  const medias: MediaItem[] = []

  // Try to parse as JSON for media messages
  try {
    const parsed = JSON.parse(text)
    if (parsed.media_id) {
      medias.push({
        mediaId: parsed.media_id,
        mediaType: msg.msgType,
        fileName: parsed.file_name,
        fileSize: parsed.file_size,
        aesKey: parsed.aes_key,
      })
      return { text: '', medias }
    }
  } catch {
    // Not JSON, treat as plain text
  }

  return { text, medias }
}

// ── Helpers ──

function getMediaType(fileName: string): number {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 2
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 4
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 3
  return 5 // file
}

function getMsgTypeForMedia(fileName: string): number {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 3
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 43
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 34
  return 49 // file/app message
}
