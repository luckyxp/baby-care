/* ============================================================================
 *  SHA-256
 * ----------------------------------------------------------------------------
 *  优先使用 WebCrypto；非安全上下文（http 局域网访问）下 crypto.subtle 不存在，
 *  回退到下方的纯 JS 实现。常量按定义在运行时推导，避免手抄 64 个魔数出错。
 * ========================================================================== */

import { toHex } from './id'

const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** 取前 count 个素数的 root 次方根小数部分的前 32 bit */
function primeFractions(count: number, root: (n: number) => number): Uint32Array {
  const out = new Uint32Array(count)
  let found = 0
  for (let n = 2; found < count; n++) {
    let prime = true
    for (let d = 2; d * d <= n; d++) {
      if (n % d === 0) {
        prime = false
        break
      }
    }
    if (prime) {
      out[found++] = (root(n) % 1) * 2 ** 32
    }
  }
  return out
}

const K = primeFractions(64, Math.cbrt)
const H0 = primeFractions(8, Math.sqrt)

export function sha256Fallback(data: Uint8Array): Uint8Array {
  const H = H0.slice()
  const blocks = ((data.length + 9 + 63) >> 6) << 6
  const buf = new Uint8Array(blocks)
  buf.set(data)
  buf[data.length] = 0x80
  const view = new DataView(buf.buffer)
  const bits = data.length * 8
  view.setUint32(blocks - 8, Math.floor(bits / 2 ** 32))
  view.setUint32(blocks - 4, bits >>> 0)

  const W = new Uint32Array(64)
  for (let off = 0; off < blocks; off += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(off + i * 4)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ror(W[i - 15], 7) ^ ror(W[i - 15], 18) ^ (W[i - 15] >>> 3)
      const s1 = ror(W[i - 2], 17) ^ ror(W[i - 2], 19) ^ (W[i - 2] >>> 10)
      W[i] = W[i - 16] + s0 + W[i - 7] + s1
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    H[0] += a
    H[1] += b
    H[2] += c
    H[3] += d
    H[4] += e
    H[5] += f
    H[6] += g
    H[7] += h
  }

  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  H.forEach((v, i) => ov.setUint32(i * 4, v))
  return out
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  if (globalThis.crypto?.subtle) {
    return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
  }
  return toHex(sha256Fallback(data))
}
