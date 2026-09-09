/**
 * postMessage protocol with the Competition Event app (register-project),
 * which embeds Mosonic in an iframe drawer. Different origin, so this is the
 * only way either side knows what the other is doing:
 *  - child -> parent "mosonic:ready"          sent once this app has mounted
 *  - parent -> child "mosonic:restore-scroll" reply with the saved scrollY
 *  - child -> parent "mosonic:state"          sent on every route/scroll change
 */
export const MOSONIC_READY = "mosonic:ready"
export const MOSONIC_RESTORE_SCROLL = "mosonic:restore-scroll"
export const MOSONIC_STATE = "mosonic:state"

export function isEmbeddedInIframe(): boolean {
  try {
    return window.parent !== window
  } catch {
    // Cross-origin access to window.parent throws in some sandboxed contexts —
    // that itself means we're embedded.
    return true
  }
}
