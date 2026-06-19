/**
 * Server-authoritative credit topup packages. The client may only reference a
 * package by id; the credit amount is always resolved here so it cannot be
 * tampered with. Pricing is informational (mock topup — no real payment yet).
 */
export type CreditPackage = {
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
};

export const CREDIT_PACKAGES: ReadonlyArray<CreditPackage> = [
  { id: 'starter', credits: 1000, priceUsd: 10, label: 'Starter' },
  { id: 'growth', credits: 5000, priceUsd: 45, label: 'Growth' },
  { id: 'scale', credits: 10000, priceUsd: 80, label: 'Scale' },
] as const;

export function findCreditPackage(id: string): CreditPackage | null {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === id) ?? null;
}
