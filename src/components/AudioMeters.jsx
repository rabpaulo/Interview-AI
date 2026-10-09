import React, { useState } from 'react';
import { Mic, Bot, Settings2, ChevronDown, ChevronUp } from 'lucide-react';

export function AudioMeters({ audioLevel, isProcessing, isListening }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Agent level: if processing, simulated pulsing between 40% and 90%
  const agentLevel = isProcessing ? Math.max(35, Math.min(95, Math.floor(Math.random() * 45) + 45)) : 0;

  return (
    <div className="w-full max-w-3xl mx-auto my-6 px-4">
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl p-4 shadow-lg">
        {/* Meters Header */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer pb-2"
        >
          <div className="flex items-center gap-2">
            <span className="flex items-end gap-0.5 h-3 w-3">
              <span className={`w-0.5 bg-cyan-400 rounded-full ${isListening ? 'h-3 animate-pulse' : 'h-1.5'}`} />
              <span className={`w-0.5 bg-cyan-400 rounded-full ${isListening ? 'h-2 animate-pulse' : 'h-2.5'}`} />
              <span className={`w-0.5 bg-cyan-400 rounded-full ${isListening ? 'h-3.5 animate-pulse' : 'h-1'}`} />
            </span>
            <span className="font-semibold uppercase tracking-wider text-zinc-300">
              Medidores de Áudio & Agente
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-300">
            <span>{isCollapsed ? 'Mostrar medidores' : 'Ocultar'}</span>
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
        </button>

        {!isCollapsed && (
          <div className="mt-3 space-y-3 pt-2 border-t border-zinc-900">
            {/* Row 1: YOU (Developer) */}
            <div className="flex items-center gap-3">
              <div className="w-16 flex items-center gap-1.5 text-xs font-bold text-zinc-300">
                <Mic size={13} className={isListening ? 'text-cyan-400' : 'text-zinc-400'} />
                <span>VOCÊ</span>
              </div>

              {/* Meter Bar */}
              <div className="flex-1 h-3 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800/80 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-75"
                  style={{ width: `${isListening ? Math.max(4, audioLevel) : 0}%` }}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-400 w-10 text-right">
                  {isListening ? `${audioLevel}%` : '0%'}
                </span>
                <Settings2 size={13} className="text-zinc-400 hover:text-zinc-300 cursor-pointer" />
              </div>
            </div>

            {/* Row 2: AGENT (Antigravity) */}
            <div className="flex items-center gap-3">
              <div className="w-16 flex items-center gap-1.5 text-xs font-bold text-purple-400">
                <Bot size={13} className={isProcessing ? 'text-purple-400 animate-spin' : 'text-zinc-400'} />
                <span>AGENTE</span>
              </div>

              {/* Meter Bar */}
              <div className="flex-1 h-3 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800/80 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-150"
                  style={{ width: `${isProcessing ? agentLevel : 0}%` }}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] font-semibold text-purple-300">
                  agy CLI
                </span>
                <Settings2 size={13} className="text-zinc-400 hover:text-zinc-300 cursor-pointer" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
