/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, RotateCcw, ArrowRight } from 'lucide-react';
import { ChatMessage } from '../types';

interface AIAdvisorProps {
  chatHistory: ChatMessage[];
  onSendMessage: (text: string) => Promise<string | null>;
  onClearHistory: () => void;
}

export default function AIAdvisor({ 
  chatHistory, 
  onSendMessage, 
  onClearHistory 
}: AIAdvisorProps) {
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // Suggestions row
  const SUGGESTIONS = [
    'Analisar reserva de emergência',
    'Dicas para economizar em moradia',
    'Simular meta do Japão',
    'Resumo de saúde financeira'
  ];

  // Auto-scroll chat to latest messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isThinking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isThinking) return;

    const userText = inputText;
    setInputText('');
    setIsThinking(true);

    try {
      await onSendMessage(userText);
    } catch (err) {
      console.error(err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSuggestionClick = async (suggestion: string) => {
    if (isThinking) return;
    setIsThinking(true);
    try {
      await onSendMessage(suggestion);
    } catch (err) {
      console.error(err);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 flex flex-col h-[520px] overflow-hidden shadow-xl">
      {/* Bot Header info */}
      <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
            <Bot className="w-4 h-4 text-indigo-100" />
          </div>
          <div>
            <h3 className="font-bold text-xs tracking-wide flex items-center gap-1.5 text-indigo-300 uppercase">
              MKS Financial Coach <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            </h3>
            <p className="text-[10px] text-slate-400 leading-none">Consultor de Patrimônio Inteligente (Gemini)</p>
          </div>
        </div>

        <button 
          onClick={onClearHistory}
          type="button" 
          title="Limpar histórico do chat"
          className="text-slate-500 hover:text-slate-300 p-1.5 hover:bg-slate-900 rounded transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4 animate-fadeIn">
            <div className="w-12 h-12 bg-indigo-950 text-indigo-400 border border-indigo-800 rounded-full flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h4 className="font-bold text-xs text-slate-200">Suas Finanças Analisadas por IA</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                Olá! Sou seu assessor financeiro. Analiso sua receita do Ledger MKS, sua evolução patrimonial e limites de orçamentos para traçar insights reais e rápidos em português.
              </p>
            </div>

            {/* Quick tips */}
            <div className="w-full pt-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">Perguntas Rápidas</span>
              <div className="grid grid-cols-2 gap-2 text-left">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className="p-2 border border-slate-800 bg-slate-950 rounded-lg hover:border-indigo-500 transition-all text-[11px] font-semibold text-slate-300 hover:text-white flex items-center justify-between"
                  >
                    <span>{s}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {chatHistory.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-2.5 max-w-[85%] ${
              msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
            }`}
          >
            <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${
              msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {msg.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>

            <div className={`rounded-xl p-3 text-[11px] font-semibold leading-relaxed ${
              msg.sender === 'user' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-slate-800/80 text-slate-200 border border-slate-750'
            }`}>
              {/* Formatter helper to split and print simple Markdown titles and list rows */}
              <div className="space-y-1">
                {msg.text.split('\n').map((line, idx) => {
                  if (line.startsWith('###')) {
                    return <h4 key={idx} className="font-extrabold text-xs text-indigo-300 mt-2">{line.replace('###', '')}</h4>;
                  }
                  if (line.startsWith('####')) {
                    return <h5 key={idx} className="font-bold text-[11px] text-emerald-400 mt-1">{line.replace('####', '')}</h5>;
                  }
                  if (line.startsWith('-') || line.startsWith('*')) {
                    return (
                      <div key={idx} className="flex gap-1.5 pl-1.5 mt-0.5">
                        <span className="text-indigo-400 shrink-0">•</span>
                        <span>{line.substring(2)}</span>
                      </div>
                    );
                  }
                  return <p key={idx}>{line}</p>;
                })}
              </div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex gap-2.5 max-w-[80%]">
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-slate-800 text-slate-300">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-slate-800/80 text-slate-300 rounded-xl px-3 py-2 text-[11px] font-semibold flex items-center gap-1.5">
              <span>Pensando analiticamente</span>
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce delay-100" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-450 animate-bounce delay-200" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-300" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input panel block */}
      <form onSubmit={handleSubmit} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Peça ideias sobre reserva, metas ou gastos..."
          disabled={isThinking}
          className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-white disabled:opacity-60"
        />
        <button 
          type="submit" 
          disabled={!inputText.trim() || isThinking}
          className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-colors disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
