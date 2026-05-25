import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

async function cachedFetch<T>(
  cache: KVNamespace,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T & { stale?: boolean }> {
  const cached = await cache.get<T>(`mkt:${key}`, 'json');
  if (cached) return cached as T;

  try {
    const data = await fetcher();
    await cache.put(`mkt:${key}`, JSON.stringify(data), { expirationTtl: ttlSeconds });
    return data as T;
  } catch (e) {
    const stale = await cache.get<T>(`mkt:${key}:stale`, 'json');
    if (stale) return { ...(stale as object), stale: true } as T & { stale: true };
    throw e;
  }
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
  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'quotes', 300, async () => {
      const tickers = 'IBOV,PETR4,VALE3,ITUB4,BBDC4,WEGE3,ABEV3';
      const r = await fetch(`https://brapi.dev/api/quote/${tickers}?range=1d&interval=1d&fundamental=false`,
        { headers: { 'User-Agent': 'MKSFinance/1.0' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`brapi ${r.status}`);
      const d = await r.json() as { results: any[] };
      const quotes = (d.results ?? []).map((q: any) => ({
        symbol: q.symbol, name: q.shortName ?? q.symbol,
        price: q.regularMarketPrice, change: q.regularMarketChangePercent,
        changeAbs: q.regularMarketChange, updatedAt: q.regularMarketTime,
      }));
      return { quotes, fetchedAt: new Date().toISOString() };
    });
    return c.json(data);
  } catch (e) {
    return c.json({ quotes: [], fetchedAt: null, error: (e as Error).message });
  }
});

router.get('/market/rates', async (c) => {
  try {
    const data = await cachedFetch(c.env.MKS_CACHE, 'rates', 300, async () => {
      const [currRes, selicRes] = await Promise.allSettled([
        fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL', { signal: AbortSignal.timeout(6000) }),
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', { signal: AbortSignal.timeout(6000) }),
      ]);

      let currencies: Record<string, unknown> = {};
      if (currRes.status === 'fulfilled' && currRes.value.ok) {
        const d = await currRes.value.json() as any;
        currencies = {
          USD: { bid: parseFloat(d.USDBRL?.bid ?? '0'), pctChange: parseFloat(d.USDBRL?.pctChange ?? '0') },
          EUR: { bid: parseFloat(d.EURBRL?.bid ?? '0'), pctChange: parseFloat(d.EURBRL?.pctChange ?? '0') },
          BTC: { bid: parseFloat(d.BTCBRL?.bid ?? '0'), pctChange: parseFloat(d.BTCBRL?.pctChange ?? '0') },
        };
      }
      let selic: number | null = null;
      if (selicRes.status === 'fulfilled' && selicRes.value.ok) {
        const d = await selicRes.value.json() as any[];
        selic = parseFloat(String(d[0]?.valor).replace(',', '.'));
      }
      return { currencies, selic, fetchedAt: new Date().toISOString() };
    });
    return c.json(data);
  } catch (e) {
    return c.json({ currencies: {}, selic: null, fetchedAt: null, error: (e as Error).message });
  }
});

router.get('/market/news', async (c) => {
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
    return c.json({ items: [], fetchedAt: null, error: (e as Error).message });
  }
});

export default router;
