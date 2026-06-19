export type OpenAiCostsBucket = {
  start_time?: number;
  end_time?: number;
  results?: Array<{
    amount?: { value?: string; currency?: string };
    line_item?: string | null;
    project_id?: string | null;
  }>;
};

export type OpenAiCostsResponse = {
  data?: OpenAiCostsBucket[];
  has_more?: boolean;
  next_page?: string | null;
};

export type OpenAiDailySpend = {
  date: string;
  amountUsd: number;
};

export type OpenAiSpendSummary = {
  totalUsd: number;
  daily: OpenAiDailySpend[];
};

const MAX_PAGES = 60;

async function fetchCostsPage(
  adminKey: string,
  startTime: number,
  page?: string,
): Promise<OpenAiCostsResponse> {
  const url = new URL('https://api.openai.com/v1/organization/costs');
  url.searchParams.set('start_time', String(startTime));
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.set('limit', '31');
  if (page) {
    url.searchParams.set('page', page);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  const body = (await res.json()) as OpenAiCostsResponse & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `OpenAI costs API HTTP ${res.status}`);
  }
  return body;
}

function bucketDate(bucket: OpenAiCostsBucket): string {
  const ts = bucket.start_time ?? bucket.end_time;
  if (ts == null) return 'unknown';
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function sumBucketUsd(bucket: OpenAiCostsBucket): number {
  let total = 0;
  for (const row of bucket.results ?? []) {
    const value = row.amount?.value;
    if (value != null && value !== '') {
      total += parseFloat(value);
    }
  }
  return total;
}

/** Fetch OpenAI org spend from Admin API for the last `days` days. */
export async function fetchOpenAiSpendSummary(
  adminKey: string,
  days: number,
): Promise<OpenAiSpendSummary> {
  const startTime = Math.floor(Date.now() / 1000) - days * 86400;
  const dailyMap = new Map<string, number>();
  let totalUsd = 0;
  let page: string | undefined;
  let pages = 0;

  for (;;) {
    const response = await fetchCostsPage(adminKey, startTime, page);
    for (const bucket of response.data ?? []) {
      const amount = sumBucketUsd(bucket);
      if (amount <= 0) continue;
      const date = bucketDate(bucket);
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + amount);
      totalUsd += amount;
    }
    pages += 1;
    if (!response.has_more || !response.next_page || pages >= MAX_PAGES) {
      break;
    }
    page = response.next_page;
  }

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amountUsd]) => ({ date, amountUsd }));

  return { totalUsd, daily };
}
