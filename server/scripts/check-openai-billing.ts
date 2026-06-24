/**
 * Report OpenAI platform spend via the Admin API.
 *
 * Requires OPENAI_ADMIN_KEY (create at platform.openai.com → Settings → Admin keys).
 *
 * Note: OpenAI does NOT expose actual prepaid credit remaining via API keys.
 * Only spend/costs are available programmatically. Check the billing dashboard
 * for exact credit balance.
 *
 * Run from `server/`:
 *   yarn openai:billing
 *   yarn openai:billing -- --days 7
 */
import 'dotenv/config';

type CostsBucket = {
  start_time?: number;
  end_time?: number;
  results?: Array<{
    amount?: { value?: string; currency?: string };
    line_item?: string | null;
    project_id?: string | null;
  }>;
};

type CostsResponse = {
  data?: CostsBucket[];
  has_more?: boolean;
  next_page?: string | null;
};

function parseArgs(): { days: number } {
  const argv = process.argv.slice(2);
  const daysIdx = argv.indexOf('--days');
  const days =
    daysIdx >= 0 && argv[daysIdx + 1]
      ? Math.max(1, parseInt(argv[daysIdx + 1]!, 10) || 30)
      : 30;
  return { days };
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

async function fetchCostsPage(
  adminKey: string,
  startTime: number,
  page?: string,
): Promise<CostsResponse> {
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
  const body = (await res.json()) as CostsResponse & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

async function sumSpendUsd(adminKey: string, days: number): Promise<number> {
  const startTime = Math.floor(Date.now() / 1000) - days * 86400;
  let total = 0;
  let page: string | undefined;

  for (;;) {
    const response = await fetchCostsPage(adminKey, startTime, page);
    for (const bucket of response.data ?? []) {
      for (const row of bucket.results ?? []) {
        const value = row.amount?.value;
        if (value != null && value !== '') {
          total += parseFloat(value);
        }
      }
    }
    if (!response.has_more || !response.next_page) {
      break;
    }
    page = response.next_page;
  }

  return total;
}

async function verifyProjectKey(apiKey: string): Promise<boolean> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function main(): Promise<void> {
  const { days } = parseArgs();
  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  const projectKey = process.env.OPENAI_API_KEY?.trim();

  console.log('OpenAI billing check\n');

  if (projectKey) {
    const ok = await verifyProjectKey(projectKey);
    console.log(
      `Project API key (OPENAI_API_KEY): ${ok ? 'valid' : 'invalid or unreachable'}`,
    );
  } else {
    console.log('Project API key (OPENAI_API_KEY): not set');
  }

  if (!adminKey) {
    console.log('\nOPENAI_ADMIN_KEY is not set.');
    console.log(
      'Create an Admin API key at https://platform.openai.com/settings/organization/admin-keys',
    );
    console.log('Then add to server/.env:');
    console.log('  OPENAI_ADMIN_KEY=sk-admin-...');
    process.exit(1);
  }

  console.log('Admin API key (OPENAI_ADMIN_KEY): set');

  try {
    const spend = await sumSpendUsd(adminKey, days);
    console.log(`\nSpend (last ${days} days): ${formatUsd(spend)}`);
    console.log(
      '\nActual prepaid credit remaining is NOT available via API keys.',
    );
    console.log(
      'OpenAI only exposes that on the billing dashboard (browser session).',
    );
    console.log(
      '  https://platform.openai.com/settings/organization/billing',
    );
  } catch (err) {
    console.error(
      `\nFailed to fetch costs: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      'Ensure OPENAI_ADMIN_KEY is an Admin key (not your project sk-proj- key).',
    );
    process.exit(1);
  }
}

main();
