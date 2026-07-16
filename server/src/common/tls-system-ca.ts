import * as tls from 'node:tls';

let applied = false;

/**
 * Prefer the OS trust store so sites with incomplete intermediate chains
 * (accepted by browsers/curl) also work under Node's default Mozilla CA bundle.
 * Safe to call multiple times; no-op on older Node without these APIs.
 */
export function useSystemCaCertificates(): void {
  if (applied) return;
  const setDefault = (
    tls as typeof tls & {
      setDefaultCACertificates?: (certs: readonly string[]) => void;
      getCACertificates?: (type?: string) => string[];
    }
  ).setDefaultCACertificates;
  const getCerts = (
    tls as typeof tls & {
      getCACertificates?: (type?: string) => string[];
    }
  ).getCACertificates;
  if (typeof setDefault !== 'function' || typeof getCerts !== 'function') {
    return;
  }
  try {
    setDefault(getCerts('system'));
    applied = true;
  } catch {
    // Keep Node defaults if the OS store is unavailable.
  }
}
