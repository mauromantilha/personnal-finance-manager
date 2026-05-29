import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const LIVE_MARKET_TTL_SECONDS = 30;
const STALE_TTL_SECONDS = 60 * 60;
const MARKET_QUOTES = [
  { symbol: 'IBOV', yahooSymbol: '^BVSP' },
  { symbol: 'PETR4', yahooSymbol: 'PETR4.SA' },
  { symbol: 'VALE3', yahooSymbol: 'VALE3.SA' },
  { symbol: 'ITUB4', yahooSymbol: 'ITUB4.SA' },
  { symbol: 'BBDC4', yahooSymbol: 'BBDC4.SA' },
  { symbol: 'WEGE3', yahooSymbol: 'WEGE3.SA' },
  { symbol: 'ABEV3', yahooSymbol: 'ABEV3.SA' },
] as const;

type CurrencyRate = {
  bid: number;
  pctChange: number;
};

async function cachedFetch<T>(
  cache: KVNamespace,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  forceFresh = false,
): Promise<T & { stale?: boolean }> {
  const cacheKey = `mkt:${key}`;
  const staleKey = `mkt:${key}:stale`;

  if (!forceFresh) {
    const cached = await cache.get<T>(cacheKey, 'json');
    if (cached) return cached as T & { stale?: boolean };
  }

  try {
    const data = await fetcher();
    await Promise.all([
      cache.put(cacheKey, JSON.stringify(data), { expirationTtl: ttlSeconds }),
      cache.put(staleKey, JSON.stringify(data), { expirationTtl: STALE_TTL_SECONDS }),
    ]);
    return data as T & { stale?: boolean };
  } catch (e) {
    const stale = await cache.get<T>(staleKey, 'json');
    if (stale) return { ...(stale as object), stale: true } as T & { stale: true };
    throw e;
  }
}

function wantsFreshData(url: URL) {
  const fresh = url.searchParams.get('fresh');
  return fresh === '1' || fresh === 'true';
}

async function fetchYahooQuote(symbol: typeof MARKET_QUOTES[number]) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.yahooSymbol)}?range=1d&interval=1d`,
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 MKSFinance/1.0',
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) throw new Error(`yahoo ${symbol.symbol} ${response.status}`);

  const data = await response.json() as {
    chart?: {
      result?: Array<{
        meta?: {
          longName?: string;
          shortName?: string;
          regularMarketPrice?: number;
          chartPreviousClose?: number;
          regularMarketTime?: number;
        };
      }>;
    };
  };

  const meta = data.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const previousClose = meta?.chartPreviousClose;

  if (typeof price !== 'number') throw new Error(`yahoo ${symbol.symbol} missing price`);

  const changeAbs = typeof previousClose === 'number' ? price - previousClose : 0;
  const change = typeof previousClose === 'number' && previousClose !== 0
    ? (changeAbs / previousClose) * 100
    : 0;

  return {
    symbol: symbol.symbol,
    name: meta?.longName ?? meta?.shortName ?? symbol.symbol,
    price,
    change,
    changeAbs,
    updatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
  };
}

async function fetchYahooFxRate(symbol: string, name: string): Promise<CurrencyRate> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`,
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 MKSFinance/1.0',
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) throw new Error(`yahoo ${name} ${response.status}`);

  const data = await response.json() as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          chartPreviousClose?: number;
        };
      }>;
    };
  };

  const meta = data.chart?.result?.[0]?.meta;
  const bid = meta?.regularMarketPrice;
  const previousClose = meta?.chartPreviousClose;

  if (typeof bid !== 'number') throw new Error(`yahoo ${name} missing price`);

  const pctChange = typeof previousClose === 'number' && previousClose !== 0
    ? ((bid - previousClose) / previousClose) * 100
    : 0;

  return { bid, pctChange };
}

async function fetchBitcoinRate(): Promise<CurrencyRate> {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true',
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 MKSFinance/1.0',
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) throw new Error(`coingecko btc ${response.status}`);

  const data = await response.json() as {
    bitcoin?: {
      brl?: number;
      brl_24h_change?: number;
    };
  };

  const bid = data.bitcoin?.brl;
  if (typeof bid !== 'number') throw new Error('coingecko btc missing price');

  return {
    bid,
    pctChange: typeof data.bitcoin?.brl_24h_change === 'number' ? data.bitcoin.brl_24h_change : 0,
  };
}

function parseRSS(xml: string, sourceName: string) {
  const items: { title: string; link: string; pubDate: string; description: string; source: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < 8) {
    const b = m[1];
    const title = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
    const link  = (b.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? b.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/i)?.[1] ?? '').trim();
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '').trim();
    const desc  = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 180);
    if (title && link) items.push({ title, link, pubDate, description: desc, source: sourceName });
  }
  return items;
}

router.get('/market/quotes', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'quotes', LIVE_MARKET_TTL_SECONDS, async () => {
      const results = await Promise.allSettled(MARKET_QUOTES.map(fetchYahooQuote));
      const quotes = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);

      if (!quotes.length) throw new Error('yahoo quotes unavailable');

      return { quotes, fetchedAt: new Date().toISOString() };
    }, wantsFreshData(new URL(c.req.url)));
    return c.json(data);
  } catch (e) {
    return c.json({ quotes: [], fetchedAt: null, error: (e as Error).message }, 502);
  }
});

router.get('/market/rates', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'rates', LIVE_MARKET_TTL_SECONDS, async () => {
      const [usdRes, eurRes, btcRes, selicRes] = await Promise.allSettled([
        fetchYahooFxRate('USDBRL=X', 'USD/BRL'),
        fetchYahooFxRate('EURBRL=X', 'EUR/BRL'),
        fetchBitcoinRate(),
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', { signal: AbortSignal.timeout(6000) }),
      ]);

      const currencies: Record<string, CurrencyRate> = {};
      if (usdRes.status === 'fulfilled') currencies.USD = usdRes.value;
      if (eurRes.status === 'fulfilled') currencies.EUR = eurRes.value;
      if (btcRes.status === 'fulfilled') currencies.BTC = btcRes.value;

      if (!Object.keys(currencies).length) {
        throw new Error('currency providers unavailable');
      }

      let selic: number | null = null;
      if (selicRes.status === 'fulfilled' && selicRes.value.ok) {
        const d = await selicRes.value.json() as any[];
        selic = parseFloat(String(d[0]?.valor).replace(',', '.'));
      }
      return { currencies, selic, fetchedAt: new Date().toISOString() };
    }, wantsFreshData(new URL(c.req.url)));
    return c.json(data);
  } catch (e) {
    return c.json({ currencies: {}, selic: null, fetchedAt: null, error: (e as Error).message }, 502);
  }
});

router.get('/market/news', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'news', 900, async () => {
      const feeds = [
        { url: 'https://www.infomoney.com.br/feed/', name: 'InfoMoney' },
        { url: 'https://g1.globo.com/rss/g1/economia/', name: 'G1 Economia' },
        { url: 'https://valor.globo.com/financas/rss', name: 'Valor Econômico' },
      ];
      const results = await Promise.allSettled(
        feeds.map(f => fetch(f.url, { headers: { 'User-Agent': 'MKSFinance/1.0' }, signal: AbortSignal.timeout(8000) })
          .then(r => r.text()).then(xml => parseRSS(xml, f.name))),
      );
      const all: any[] = [];
      results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
      all.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      return { items: all.slice(0, 10), fetchedAt: new Date().toISOString() };
    });
    return c.json(data);
  } catch (e) {
    return c.json({ items: [], fetchedAt: null, error: (e as Error).message }, 502);
  }
});

export default router;
