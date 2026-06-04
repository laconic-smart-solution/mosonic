import * as dns from 'node:dns/promises';
import * as net from 'node:net';

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('ff')) return true;
    return false;
  }
  return true;
}

/** Throws Error with reason string if URL must not be fetched (SSRF guard). */
export async function assertUrlSafeForFetch(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs are allowed');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error('Host is not allowed');
  }
  if (net.isIP(url.hostname)) {
    if (isBlockedIp(url.hostname)) {
      throw new Error('Address is not allowed');
    }
    return url;
  }
  let lookupHost = url.hostname;
  if (lookupHost.startsWith('[') && lookupHost.endsWith(']')) {
    lookupHost = lookupHost.slice(1, -1);
  }
  const { address } = await dns.lookup(lookupHost);
  if (isBlockedIp(address)) {
    throw new Error('Resolved address is not allowed');
  }
  return url;
}
