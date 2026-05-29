/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, ExternalLink, Newspaper, Clock, Minus } from 'lucide-react';

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changeAbs: number;
}
interface QuotesData { quotes: Quote[]; fetchedAt: string | null; stale?: boolean; error?: string }

interface Rates {
  currencies: {
    USD?: { bid: number; pctChange: number };
    EUR?: { bid: number; pctChange: number };
    BTC?: { bid: number; pctChange: number };
  };
  selic: number | null;
  fetchedAt: string | null;
  stale?: boolean;
  error?: string;
}

interface NewsItem { title: string; link: string; pubDate: string; description: string; source: string }
interface NewsData { items: NewsItem[]; fetchedAt: string | null; stale?: boolean; error?: string }

function DeltaBadge({ pct, compact = false }: { pct: number; compact?: boolean }) {
  const up = pct > 0; const flat = pct === 0;
  const cls = flat ? 'text-slate-500' : up ? 'text-emerald-600' : 'text-rose-600';
  const bg = flat ? 'bg-slate-50' : up ? 'bg-emerald-50' : 'bg-rose-50';
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${cls} ${bg}`}>
      <Icon className="w-2.5 h-2.5" />
      {compact ? '' : (up ? '+' : '')}{pct.toFixed(2)}%
    </span>
  );
}

function SkeletonBar({ w = 'w-16' }: { w?: string }) {
  return <div className={`h-3 ${w} bg-slate-200 rounded animate-pulse`} />;
}

function relativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'agora';
    if (mins < 60) return `há ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `há ${hrs}h`;
    return `há ${Math.floor(hrs / 24)}d`;
  } catch { return ''; }
}

function fmtBRL(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MarketWidget() {
  const [quotes, setQuotes] = useState<QuotesData | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [news, setNews] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchJson = useCallback(async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }, []);

  const fetchAll = useCallback(async (showRefreshing = false, forceFresh = false) => {
    if (showRefreshing) setRefreshing(true);

    const query = forceFresh ? '?fresh=1' : '';

    try {
      const [qRes, rRes, nRes] = await Promise.allSettled([
        fetchJson<QuotesData>(`/api/market/quotes${query}`),
        fetchJson<Rates>(`/api/market/rates${query}`),
        fetchJson<NewsData>('/api/market/news'),
      ]);

      if (qRes.status === 'fulfilled') setQuotes(qRes.value);
      if (rRes.status === 'fulfilled') setRates(rRes.value);
      if (nRes.status === 'fulfilled') setNews(nRes.value);

      const fetchedAts = [qRes, rRes, nRes]
        .flatMap((result) => result.status === 'fulfilled' && result.value.fetchedAt ? [result.value.fetchedAt] : [])
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.getTime()));

      setLastRefresh(fetchedAts.length ? new Date(Math.max(...fetchedAts.map((value) => value.getTime()))) : new Date());

      if (qRes.status === 'rejected' && rRes.status === 'rejected') {
        setLoadError('Nao foi possivel atualizar cotacoes e cambio agora.');
      } else if (qRes.status === 'rejected') {
        setLoadError('Nao foi possivel atualizar cotacoes agora.');
      } else if (rRes.status === 'rejected') {
        setLoadError('Nao foi possivel atualizar cambio agora.');
      } else {
        setLoadError(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchJson]);

  useEffect(() => {
    fetchAll();
    // Cotações + câmbio: a cada 30 segundos
    const quotesTimer = setInterval(async () => {
      if (document.hidden) return;

      try {
        const [qRes, rRes] = await Promise.allSettled([
          fetchJson<QuotesData>('/api/market/quotes'),
          fetchJson<Rates>('/api/market/rates'),
        ]);
        if (qRes.status === 'fulfilled') setQuotes(qRes.value);
        if (rRes.status === 'fulfilled') setRates(rRes.value);
        setLastRefresh(new Date());
      } catch { /* mantém último dado disponível */ }
    }, 30 * 1000);
    // Notícias: a cada 15 minutos (mantém últimas notícias se falhar)
    const newsTimer = setInterval(async () => {
      if (document.hidden) return;

      try {
        const res = await fetch('/api/market/news', { cache: 'no-store' });
        if (res.ok) setNews(await res.json());
      } catch { /* mantém últimas notícias */ }
    }, 15 * 60 * 1000);
    return () => { clearInterval(quotesTimer); clearInterval(newsTimer); };
  }, [fetchAll, fetchJson]);

  const ibov = quotes?.quotes?.find(q => q.symbol === 'IBOV');
  const stocks = quotes?.quotes?.filter(q => q.symbol !== 'IBOV') || [];
  const currencies = rates?.currencies || {};

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Widget header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Mercado ao Vivo</span>
          {(quotes?.stale || rates?.stale) && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded border border-amber-200">cache</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => fetchAll(true, true)}
            disabled={refreshing}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="px-5 py-2 border-b border-amber-100 bg-amber-50 text-[11px] font-medium text-amber-700">
          {loadError}
        </div>
      )}

      <div className="p-5 space-y-5">

        {/* ── Row 1: Índices + Moedas ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* IBOVESPA */}
          <div className="col-span-1 bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">IBOVESPA</p>
            {loading ? <><SkeletonBar w="w-20" /><SkeletonBar w="w-10" /></> : (
              <>
                <p className="text-base font-black font-mono text-slate-800">
                  {ibov ? ibov.price.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}
                </p>
                {ibov ? <DeltaBadge pct={ibov.change} /> : <span className="text-[10px] text-slate-400">N/D</span>}
              </>
            )}
          </div>

          {/* SELIC */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SELIC Meta</p>
            {loading ? <><SkeletonBar w="w-16" /><SkeletonBar w="w-8" /></> : (
              <>
                <p className="text-base font-black font-mono text-slate-800">
                  {rates?.selic != null ? `${rates.selic.toFixed(2)}%` : '—'}
                </p>
                <p className="text-[9px] text-slate-400">ao ano</p>
              </>
            )}
          </div>

          {/* USD */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">USD / BRL</p>
            {loading ? <><SkeletonBar w="w-16" /><SkeletonBar w="w-10" /></> : (
              <>
                <p className="text-base font-black font-mono text-slate-800">
                  {currencies.USD ? `R$ ${currencies.USD.bid.toFixed(2)}` : '—'}
                </p>
                {currencies.USD ? <DeltaBadge pct={currencies.USD.pctChange} /> : <span className="text-[10px] text-slate-400">N/D</span>}
              </>
            )}
          </div>

          {/* EUR */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">EUR / BRL</p>
            {loading ? <><SkeletonBar w="w-16" /><SkeletonBar w="w-10" /></> : (
              <>
                <p className="text-base font-black font-mono text-slate-800">
                  {currencies.EUR ? `R$ ${currencies.EUR.bid.toFixed(2)}` : '—'}
                </p>
                {currencies.EUR ? <DeltaBadge pct={currencies.EUR.pctChange} /> : <span className="text-[10px] text-slate-400">N/D</span>}
              </>
            )}
          </div>

          {/* BTC */}
          <div className="col-span-2 sm:col-span-1 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">BTC / BRL</p>
            {loading ? <><SkeletonBar w="w-20" /><SkeletonBar w="w-10" /></> : (
              <>
                <p className="text-base font-black font-mono text-slate-800">
                  {currencies.BTC ? fmtBRL(currencies.BTC.bid) : '—'}
                </p>
                {currencies.BTC ? <DeltaBadge pct={currencies.BTC.pctChange} /> : <span className="text-[10px] text-slate-400">N/D</span>}
              </>
            )}
          </div>
        </div>

        {/* ── Row 2: Ações B3 ── */}
        {(loading || stocks.length > 0) && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ações em Destaque — B3</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl p-3 space-y-2">
                    <SkeletonBar w="w-12" /><SkeletonBar w="w-16" /><SkeletonBar w="w-10" />
                  </div>
                ))
                : stocks.map(q => (
                  <div key={q.symbol} className="border border-slate-100 rounded-xl p-3 space-y-1 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                    <p className="text-[10px] font-black text-slate-700">{q.symbol}</p>
                    <p className="text-sm font-bold font-mono text-slate-800">
                      R$ {q.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <DeltaBadge pct={q.change} />
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Row 3: Notícias ── */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Newspaper className="w-3 h-3" /> Notícias Econômicas
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3 border border-slate-100 rounded-xl">
                  <div className="flex-1 space-y-1.5"><SkeletonBar w="w-full" /><SkeletonBar w="w-3/4" /></div>
                  <SkeletonBar w="w-12" />
                </div>
              ))}
            </div>
          ) : !news?.items?.length ? (
            <p className="text-xs text-slate-400 py-3 text-center">Nenhuma notícia disponível no momento.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {news.items.map((item, i) => (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 leading-snug group-hover:text-indigo-700 line-clamp-2">{item.title}</p>
                    {item.description && (
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{item.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-indigo-500">{item.source}</span>
                      <span className="text-[9px] text-slate-400">{relativeTime(item.pubDate)}</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
                </a>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
