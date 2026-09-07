import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const LIVE_MARKET_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 60 * 60;

const MARKET_QUOTES = [
  { symbol: 'IBOV', yahooSymbol: '^BVSP', fallbackPrice: 185000, fallbackChange: 0.45 },
  { symbol: 'PETR4', yahooSymbol: 'PETR4.SA', fallbackPrice: 38.50, fallbackChange: 0.82 },
  { symbol: 'VALE3', yahooSymbol: 'VALE3.SA', fallbackPrice: 62.10, fallbackChange: -0.35 },
  { symbol: 'ITUB4', yahooSymbol: 'ITUB4.SA', fallbackPrice: 35.80, fallbackChange: 0.28 },
  { symbol: 'BBDC4', yahooSymbol: 'BBDC4.SA', fallbackPrice: 14.90, fallbackChange: -0.15 },
  { symbol: 'WEGE3', yahooSymbol: 'WEGE3.SA', fallbackPrice: 53.40, fallbackChange: 1.10 },
  { symbol: 'ABEV3', yahooSymbol: 'ABEV3.SA', fallbackPrice: 12.30, fallbackChange: 0.05 },
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
    try {
      const cached = await cache.get<T>(cacheKey, 'json');
      if (cached) return cached as T & { stale?: boolean };
    } catch { /* cache get fallback */ }
  }

  try {
    const data = await fetcher();
    try {
      await Promise.all([
        cache.put(cacheKey, JSON.stringify(data), { expirationTtl: ttlSeconds }),
        cache.put(staleKey, JSON.stringify(data), { expirationTtl: STALE_TTL_SECONDS }),
      ]);
    } catch { /* cache put fallback */ }
    return data as T & { stale?: boolean };
  } catch (e) {
    try {
      const stale = await cache.get<T>(staleKey, 'json');
      if (stale) return { ...(stale as object), stale: true } as T & { stale: true };
    } catch { /* stale get fallback */ }
    throw e;
  }
}

function wantsFreshData(url: URL) {
  const fresh = url.searchParams.get('fresh');
  return fresh === '1' || fresh === 'true';
}

/** AwesomeAPI — provedor de alta disponibilidade para cotações em BRL */
async function fetchAwesomeFxRates(): Promise<Record<string, CurrencyRate>> {
  const response = await fetch(
    'https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL',
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 MKSFinance/1.0',
      },
      signal: AbortSignal.timeout(6000),
    },
  );

  if (!response.ok) throw new Error(`awesomeapi ${response.status}`);
  const data = await response.json() as any;

  return {
    USD: {
      bid: parseFloat(data.USDBRL?.bid || '5.65'),
      pctChange: parseFloat(data.USDBRL?.pctChange || '0'),
    },
    EUR: {
      bid: parseFloat(data.EURBRL?.bid || '6.15'),
      pctChange: parseFloat(data.EURBRL?.pctChange || '0'),
    },
    BTC: {
      bid: parseFloat(data.BTCBRL?.bid || '355000'),
      pctChange: parseFloat(data.BTCBRL?.pctChange || '0'),
    },
  };
}

async function fetchYahooQuote(item: typeof MARKET_QUOTES[number]) {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.yahooSymbol)}?range=1d&interval=1d`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MKSFinance/1.0',
        },
        signal: AbortSignal.timeout(6000),
      },
    );

    if (response.ok) {
      const data = await response.json() as any;
      const meta = data.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const previousClose = meta?.chartPreviousClose;

      if (typeof price === 'number') {
        const changeAbs = typeof previousClose === 'number' ? price - previousClose : 0;
        const change = typeof previousClose === 'number' && previousClose !== 0
          ? (changeAbs / previousClose) * 100
          : 0;

        return {
          symbol: item.symbol,
          name: meta?.longName ?? meta?.shortName ?? item.symbol,
          price,
          change,
          changeAbs,
          updatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
        };
      }
    }
  } catch { /* fallback to default quote */ }

  return {
    symbol: item.symbol,
    name: item.symbol,
    price: item.fallbackPrice,
    change: item.fallbackChange,
    changeAbs: (item.fallbackPrice * item.fallbackChange) / 100,
    updatedAt: new Date().toISOString(),
  };
}

function parseRSS(xml: string, sourceName: string) {
  const items: { title: string; link: string; pubDate: string; description: string; source: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < 8) {
    const b = m[1];
    const rawTitle = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .trim();
    // No Google News RSS o título costuma vir como "Manchete - Fonte", removemos o sufixo duplicado da fonte
    const title = rawTitle.replace(/\s*-\s*[^-]+$/, '').trim() || rawTitle;
    const link  = (b.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? b.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/i)?.[1] ?? '').trim();
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '').trim();
    const desc  = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 180);
    if (title && link) items.push({ title, link, pubDate, description: desc, source: sourceName });
  }
  return items;
}

const FALLBACK_CURRENCIES: Record<string, CurrencyRate> = {
  USD: { bid: 5.12, pctChange: -0.15 },
  EUR: { bid: 5.96, pctChange: 0.22 },
  BTC: { bid: 410000, pctChange: 1.45 },
};

router.get('/market/quotes', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'quotes', LIVE_MARKET_TTL_SECONDS, async () => {
      const quotes = await Promise.all(MARKET_QUOTES.map(fetchYahooQuote));
      return { quotes, fetchedAt: new Date().toISOString() };
    }, wantsFreshData(new URL(c.req.url)));
    return c.json(data);
  } catch {
    const fallbackQuotes = MARKET_QUOTES.map(item => ({
      symbol: item.symbol,
      name: item.symbol,
      price: item.fallbackPrice,
      change: item.fallbackChange,
      changeAbs: (item.fallbackPrice * item.fallbackChange) / 100,
      updatedAt: new Date().toISOString(),
    }));
    return c.json({ quotes: fallbackQuotes, fetchedAt: new Date().toISOString(), isFallback: true }, 200);
  }
});

router.get('/market/rates', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'rates', LIVE_MARKET_TTL_SECONDS, async () => {
      let currencies: Record<string, CurrencyRate> = {};
      try {
        currencies = await fetchAwesomeFxRates();
      } catch {
        currencies = FALLBACK_CURRENCIES;
      }

      let selic: number | null = null;
      try {
        const selicRes = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', {
          headers: { 'User-Agent': 'Mozilla/5.0 MKSFinance/1.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (selicRes.ok) {
          const d = await selicRes.json() as any[];
          selic = parseFloat(String(d[0]?.valor).replace(',', '.'));
        }
      } catch { /* selic fallback */ }

      const finalCurrencies = Object.keys(currencies).length > 0 ? currencies : FALLBACK_CURRENCIES;

      return { currencies: finalCurrencies, selic: selic ?? 10.5, fetchedAt: new Date().toISOString() };
    }, wantsFreshData(new URL(c.req.url)));
    return c.json(data);
  } catch {
    return c.json({ currencies: FALLBACK_CURRENCIES, selic: 10.5, fetchedAt: new Date().toISOString(), isFallback: true }, 200);
  }
});

router.get('/market/news', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'news', 600, async () => {
      const feeds = [
        { url: 'https://news.google.com/rss/search?q=mercado+financeiro+brasil+economia&hl=pt-BR&gl=BR&ceid=BR:pt-419', name: 'Google Notícias' },
        { url: 'https://www.infomoney.com.br/feed/', name: 'InfoMoney' },
        { url: 'https://g1.globo.com/rss/g1/economia/', name: 'G1 Economia' },
        { url: 'https://valor.globo.com/financas/rss', name: 'Valor Econômico' },
      ];
      const results = await Promise.allSettled(
        feeds.map(f => fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MKSFinance/1.0' }, signal: AbortSignal.timeout(7000) })
          .then(r => r.text()).then(xml => parseRSS(xml, f.name))),
      );
      const all: any[] = [];
      results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
      all.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      return { items: all.slice(0, 10), fetchedAt: new Date().toISOString() };
    });
    return c.json(data);
  } catch {
    return c.json({ items: [], fetchedAt: new Date().toISOString(), isFallback: true }, 200);
  }
});

export default router;
