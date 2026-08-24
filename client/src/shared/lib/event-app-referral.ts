export const APP_SOURCE_STORAGE_KEY = "app_source"
export const EVENT_APP_SOURCE = "crabonic"

/** True when this session arrived via the register-project (Crabonic) SSO handoff. */
export function isFromEventApp(): boolean {
  try {
    return sessionStorage.getItem(APP_SOURCE_STORAGE_KEY) === EVENT_APP_SOURCE
  } catch {
    return false
  }
}
