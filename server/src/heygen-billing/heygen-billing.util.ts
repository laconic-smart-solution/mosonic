export type HeygenUserMeResponse = {
  data?: {
    username?: string;
    billing_type?: string;
    wallet?: {
      remaining_balance?: number;
      currency?: string;
    };
    usage_based?: {
      spending_current_usd?: number;
    };
  };
  error?: { message?: string };
};

export type HeygenWalletSummary = {
  billingType: string | null;
  walletBalanceUsd: number | null;
  spendingCurrentUsd: number | null;
};

export async function fetchHeygenWalletSummary(
  apiKey: string,
): Promise<HeygenWalletSummary> {
  const res = await fetch('https://api.heygen.com/v3/users/me', {
    headers: { 'X-Api-Key': apiKey },
  });
  const body = (await res.json()) as HeygenUserMeResponse;
  if (!res.ok) {
    throw new Error(body.error?.message ?? `HeyGen API HTTP ${res.status}`);
  }

  const data = body.data;
  const walletRaw = data?.wallet?.remaining_balance;
  const walletBalanceUsd =
    walletRaw != null && !Number.isNaN(Number(walletRaw))
      ? Number(walletRaw)
      : null;
  const spendingRaw = data?.usage_based?.spending_current_usd;
  const spendingCurrentUsd =
    spendingRaw != null && !Number.isNaN(Number(spendingRaw))
      ? Number(spendingRaw)
      : null;

  return {
    billingType: data?.billing_type?.trim() || null,
    walletBalanceUsd,
    spendingCurrentUsd,
  };
}
