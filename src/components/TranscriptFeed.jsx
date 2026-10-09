import React, { useState } from 'react';
import { Sparkles, Mic, Bot, StopCircle, CheckCircle2, Clock, Cpu, MessageSquare, Terminal, FileText } from 'lucide-react';
import { FormattedAgentResponse } from './CodeBlock.jsx';

export function TranscriptFeed({
  messages,
  interimTranscript,
  isListening,
  isProcessing,
  currentToolCall,
  onAbort,
}) {
  const [activeTab, setActiveTab] = useState('transcription'); // transcription | session | summary

  return (
    <section className="w-full max-w-4xl mx-auto px-4 pb-24">
      {/* Perssua Tabs Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-6">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('transcription')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'transcription'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Mic size={14} className={activeTab === 'transcription' ? 'text-cyan-400' : ''} />
            <span>Transcrição ao Vivo</span>
          </button>

          <button
            onClick={() => setActiveTab('session')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'session'
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Terminal size={14} className={activeTab === 'session' ? 'text-purple-400' : ''} />
            <span>Sessão & Agente</span>
          </button>

          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'summary'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FileText size={14} className={activeTab === 'summary' ? 'text-emerald-400' : ''} />
            <span>Resumo</span>
          </button>
        </div>

        {isProcessing && (
          <button
            onClick={onAbort}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-xs transition cursor-pointer"
          >
            <StopCircle size={13} />
            <span>Interromper</span>
          </button>
        )}
      </div>

      {/* Interim / Live Voice speech card */}
      {isListening && interimTranscript && (
        <div className="mb-6 rounded-2xl border border-cyan-500/40 bg-cyan-950/20 p-5 backdrop-blur-xl animate-pulse">
          <div className="flex items-center gap-2 mb-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Ouvindo sua voz agora...</span>
          </div>
          <p className="text-zinc-100 font-medium text-base sm:text-lg italic">
            “{interimTranscript}”
          </p>
        </div>
      )}

      {/* Empty State */}
      {messages.length === 0 && !interimTranscript && (
        <div className="text-center py-16 px-4 rounded-2xl border border-zinc-900 bg-zinc-950/40">
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-cyan-400">
            <Sparkles size={22} />
          </div>
          <h3 className="text-zinc-200 font-bold text-base mb-1">
            Nenhuma mensagem de voz gravada ainda
          </h3>
          <p className="text-zinc-400 text-xs sm:text-sm max-w-md mx-auto mb-4">
            Clique no microfone ou segure <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-xs">ESPAÇO</kbd> e faça um pedido de código em português ou inglês.
          </p>
        </div>
      )}

      {/* Main Conversation Feed (Transcripts & Responses) */}
      <div className="space-y-6">
        {messages.map((item, idx) => {
          if (item.role === 'user') {
            return (
              <div
                key={item.id || idx}
                className="rounded-2xl border border-zinc-800 bg-[#121218]/90 p-5 shadow-lg backdrop-blur-xl"
              >
                <div className="flex items-center justify-between mb-3 text-xs text-zinc-400">
                  <div className="flex items-center gap-2 font-bold tracking-wider text-cyan-400">
                    <Mic size={14} />
                    <span>VOCÊ FALOU</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <blockquote className="text-base sm:text-lg font-medium text-zinc-100 border-l-2 border-cyan-500/50 pl-3 italic">
                  “{item.text}”
                </blockquote>
              </div>
            );
          }

          // Agent Response Card
          return (
            <div
              key={item.id || idx}
              className="rounded-2xl border border-purple-500/30 bg-gradient-to-b from-[#14121f]/90 to-[#0e0d16]/90 p-5 sm:p-6 shadow-xl backdrop-blur-xl relative overflow-hidden"
            >
              {/* Agent card header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-purple-500/15">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Sparkles size={13} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                      Antigravity Code Agent
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20 font-semibold">
                      Diga isso / Solução
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {item.status === 'streaming' && (
                    <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      Gerando...
                    </span>
                  )}
                  {item.status === 'done' && (
                    <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
                      <CheckCircle2 size={13} />
                      Concluído
                    </span>
                  )}
                </div>
              </div>

              {/* Tool Execution or Thinking badge */}
              {isProcessing && currentToolCall && (
                <div className="mb-4 p-2.5 rounded-lg bg-zinc-900/90 border border-purple-500/20 flex items-center gap-2 text-xs text-purple-300 animate-pulse">
                  <Terminal size={14} className="text-purple-400" />
                  <span>
                    Executando ação do agente:{' '}
                    <strong className="text-white font-mono">{currentToolCall.type}</strong>
                  </span>
                </div>
              )}

              {/* Agent content / Markdown */}
              {item.text ? (
                <FormattedAgentResponse text={item.text} />
              ) : item.status === 'streaming' ? (
                <div className="flex items-center gap-2 py-3 text-sm text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span>O Antigravity está analisando o workspace e formulando a resposta...</span>
                </div>
              ) : null}

              {/* Streaming typing cursor */}
              {item.status === 'streaming' && item.text && (
                <span className="inline-block w-2 h-4 bg-purple-400 ml-1 animate-pulse align-middle" />
              )}

              {/* Footer with stats */}
              {item.status === 'done' && (
                <div className="mt-4 pt-3 border-t border-white/[0.05] flex flex-wrap items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <div className="flex items-center gap-3">
                    {item.duration && (
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {Number(item.duration).toFixed(1)}s
                      </span>
                    )}
                    {item.usage?.total_tokens && (
                      <span className="flex items-center gap-1">
                        <Cpu size={12} />
                        {item.usage.total_tokens.toLocaleString()} tokens
                      </span>
                    )}
                  </div>
                  <span className="text-zinc-400">Modelo: Gemini 3.8 Flash</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
