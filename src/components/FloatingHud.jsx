import React, { useState } from 'react';
import { Mic, MicOff, Maximize2, Sparkles, X, Bot, Volume2 } from 'lucide-react';

export function FloatingHud({
  isListening,
  isProcessing,
  toggleListening,
  frequencyBars,
  interimTranscript,
  lastMessage,
  onExpand,
}) {
  const [isMinimized, setIsMinimized] = useState(false);

  // Take first 16 bars for compact HUD
  const miniBars = frequencyBars.slice(16, 32);

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900/90 border border-cyan-500/40 text-cyan-400 shadow-2xl backdrop-blur-xl hover:scale-105 transition cursor-pointer"
      >
        <Sparkles size={16} />
        <span className="text-xs font-bold">Perssua HUD</span>
        {isListening && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-2xl border border-cyan-500/30 bg-[#0c0c12]/95 shadow-2xl backdrop-blur-2xl p-4 text-zinc-100 transition-all duration-300">
      {/* Top HUD Bar */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center">
            <Sparkles size={12} className="text-white" />
          </div>
          <span className="text-xs font-bold tracking-tight text-white">Perssua HUD</span>
          <span
            className={`w-2 h-2 rounded-full ${
              isListening ? 'bg-red-400 animate-ping' : isProcessing ? 'bg-cyan-400 animate-pulse' : 'bg-emerald-400'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onExpand}
            className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            title="Expandir para tela cheia"
          >
            <Maximize2 size={13} />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            title="Minimizar HUD"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Mini Waveform & Mic Control */}
      <div className="flex items-center justify-between gap-3 my-2 px-1">
        <div className="flex-1 h-8 flex items-end justify-center gap-1 bg-zinc-900/60 rounded-lg px-2 py-1">
          {miniBars.map((h, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-75 ${
                isListening
                  ? 'bg-cyan-400'
                  : isProcessing
                  ? 'bg-purple-400 animate-pulse'
                  : 'bg-zinc-700'
              }`}
              style={{ height: `${Math.max(15, h * 0.75)}%` }}
            />
          ))}
        </div>

        <button
          onClick={toggleListening}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer ${
            isListening
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
              : 'bg-cyan-500 text-black hover:bg-cyan-400 font-bold'
          }`}
        >
          {isListening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
      </div>

      {/* Live speech preview */}
      {isListening && interimTranscript && (
        <div className="mt-2 p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 italic line-clamp-2">
          “{interimTranscript}”
        </div>
      )}

      {/* Last agent response preview */}
      {lastMessage && lastMessage.role === 'agent' && !isListening && (
        <div className="mt-2 p-2.5 rounded-lg bg-zinc-900/90 border border-purple-500/20 text-xs text-zinc-300">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">
            <Bot size={11} />
            <span>Resposta do Agente:</span>
          </div>
          <p className="line-clamp-3 text-zinc-200 font-mono text-[11px] leading-tight">
            {lastMessage.text}
          </p>
        </div>
      )}
    </div>
  );
}
