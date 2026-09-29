/* ============================================================================
 *  跨标签页事件总线
 * ----------------------------------------------------------------------------
 *  BroadcastChannel 优先；老版本 Safari（<15.4）回退到 localStorage 的 storage
 *  事件。模拟云端用它向同源的所有标签页广播"家庭数据有变更"。
 * ========================================================================== */

export interface Bus<T> {
  post(msg: T): void
  on(fn: (msg: T) => void): () => void
}

export function createBus<T>(name: string): Bus<T> {
  const listeners = new Set<(msg: T) => void>()
  const emit = (msg: T) => listeners.forEach((fn) => fn(msg))
  const on = (fn: (msg: T) => void) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(name)
    channel.onmessage = (e: MessageEvent<T>) => emit(e.data)
    return { post: (msg) => channel.postMessage(msg), on }
  }

  const key = `bus:${name}`
  window.addEventListener('storage', (e) => {
    if (e.key === key && e.newValue) {
      emit((JSON.parse(e.newValue) as { msg: T }).msg)
    }
  })
  return {
    post: (msg) => localStorage.setItem(key, JSON.stringify({ msg, nonce: Math.random() })),
    on,
  }
}
