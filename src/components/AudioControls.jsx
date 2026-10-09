import React, { useState } from 'react';
import { Send, Sparkles, Terminal, Play, Mic } from 'lucide-react';

const SUGGESTIONS = [
  'Liste os arquivos deste projeto',
  'Crie um script em Python para somar dois números',
  'Explique o arquivo server/index.js',
  'Verifique o status do repositório git',
];

export function AudioControls({ onSendMessage, isProcessing, isListening }) {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    onSendMessage(inputText.trim(), 'text');
    setInputText('');
  };

  const handleSuggestionClick = (text) => {
    if (isProcessing) return;
    onSendMessage(text, 'suggestion');
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 mb-10">
      {/* Suggestions chips */}
      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-zinc-500 font-medium whitespace-nowrap flex items-center gap-1">
          <Sparkles size={12} className="text-cyan-400" />
          Sugestões rápidas:
        </span>
        {SUGGESTIONS.map((sug, i) => (
          <button
            key={i}
            onClick={() => handleSuggestionClick(sug)}
            disabled={isProcessing}
            className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition whitespace-nowrap text-xs cursor-pointer disabled:opacity-50"
          >
            {sug}
          </button>
        ))}
      </div>

      {/* Text fallback input form */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 shadow-xl backdrop-blur-xl"
      >
        <div className="pl-3 text-zinc-400">
          <Terminal size={16} />
        </div>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ou digite uma instrução para o Antigravity Code Agent..."
          disabled={isProcessing}
          className="flex-1 bg-transparent px-2 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!inputText.trim() || isProcessing}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-medium text-xs flex items-center gap-1.5 hover:opacity-95 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
        >
          <Send size={13} />
          <span>Enviar</span>
        </button>
      </form>
    </div>
  );
}
