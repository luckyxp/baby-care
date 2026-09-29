/* ============================================================================
 *  标识符生成
 * ----------------------------------------------------------------------------
 *  crypto.randomUUID 仅在安全上下文（https / localhost）可用，而局域网调试常是
 *  http —— 统一基于 getRandomValues 自行拼装，任何环境都可用。
 * ========================================================================== */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

/** 邀请码字母表：去掉了 0/O、1/I/L 等易混字符 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) {
    s += HEX[b]
  }
  return s
}

/** RFC 4122 v4 UUID */
export function uid(): string {
  const b = randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = toHex(b)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** 会话令牌：128 bit 随机数 */
export function token(): string {
  return toHex(randomBytes(16))
}

/** 6 位邀请码 */
export function inviteCode(): string {
  return Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}
