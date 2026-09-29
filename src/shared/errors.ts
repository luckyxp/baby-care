/* ============================================================================
 *  接口错误码
 * ----------------------------------------------------------------------------
 *  与未来 HTTP 后端的约定：
 *    UNAUTHORIZED → 401   NO_FAMILY → 403(未加入/已被移出)   FORBIDDEN → 403
 *    NOT_FOUND    → 404   CONFLICT  → 409   INVALID → 422   NETWORK → 网络不可达
 * ========================================================================== */

export type ErrorCode = 'UNAUTHORIZED' | 'NO_FAMILY' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'NETWORK'

export class ApiError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export const isApiError = (e: unknown, code?: ErrorCode): e is ApiError =>
  e instanceof ApiError && (!code || e.code === code)

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)
