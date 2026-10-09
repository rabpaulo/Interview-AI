import React, { useState } from 'react';
import { CandidateContextEditor } from './CandidateContextEditor.jsx';
import {
  Mic,
  MicOff,
  Sparkles,
  Keyboard,
  Send,
  X,
  UserRound,
} from 'lucide-react';

export function CompactBottomBar({
  isListening,
  isProcessing,
  toggleListening,
  onSendMessage,
  onTriggerCopilot,
  agentSettings,
}) {
  const [showInputDrawer, setShowInputDrawer] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showContext, setShowContext] = useState(false);

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim() || isProcessing) return;
    onSendMessage(textInput.trim(), 'text', {
      provider: agentSettings.provider,
      model: agentSettings.currentModelId,
      reasoningEffort: agentSettings.currentReasoning,
      fastMode: agentSettings.fastMode,
    });
    setTextInput('');
    setShowInputDrawer(false);
  };

  return (
    <div className="app-bottom-bar relative px-4 py-2.5">
      {showContext && (
        <CandidateContextEditor
          initialContext={agentSettings.candidateContext || ''}
          onSave={(text) => { agentSettings.setCandidateContext(text); setShowContext(false); }}
          onClose={() => setShowContext(false)}
        />
      )}
      {/* Keyboard Input Drawer */}
      {showInputDrawer && (
        <form onSubmit={handleTextSubmit} className="mb-2 flex items-center gap-1.5">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Digite sua dúvida ou comando..."
            autoFocus
            disabled={isProcessing}
            className="app-text-input flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || isProcessing}
            className="app-primary-button px-2.5 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
          >
            <Send size={11} />
            <span>Enviar</span>
          </button>
          <button
            type="button"
            onClick={() => setShowInputDrawer(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition cursor-pointer"
          >
            <X size={14} />
          </button>
        </form>
      )}

      {/* Main Bottom Controls Bar */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: Context & Keyboard triggers */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setShowContext(!showContext);
              setShowInputDrawer(false);
            }}
            aria-label="Meu contexto"
            aria-expanded={showContext}
            title="Meu contexto para a entrevista"
            className={`p-2 rounded-xl transition cursor-pointer ${showContext ? 'bg-white/10 text-white' : 'app-quiet-button text-zinc-400'}`}
          >
            <UserRound size={15} />
          </button>
          <button
            type="button"
            onClick={() => { setShowInputDrawer(!showInputDrawer); setShowContext(false); }}
            className={`p-2 rounded-xl transition cursor-pointer ${
              showInputDrawer
                ? 'bg-white/10 text-white border border-white/20'
                : 'app-quiet-button text-zinc-400'
            }`}
            title="Digitar comando ou pergunta de texto"
          >
            <Keyboard size={15} />
          </button>

        </div>

        {/* Center: Hero Mic Button */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={toggleListening}
            className={`relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 cursor-pointer shadow-lg ${
              isListening
                ? 'bg-blue-500 text-white shadow-blue-500/20 scale-105 ring-4 ring-blue-500/15'
                : 'bg-white text-black hover:scale-105 hover:bg-zinc-200 font-bold'
            }`}
            title={isListening ? 'Clique para parar' : 'Clique para falar (ou segure ESPAÇO)'}
          >
            {isListening && (
              <span className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20 pointer-events-none" />
            )}
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </div>

        {/* Right: Fast "Diga isso" / Copilot Trigger Button */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onTriggerCopilot?.(null, {
                provider: agentSettings?.provider,
                model: agentSettings?.currentModelId,
                reasoningEffort: agentSettings?.currentReasoning,
                fastMode: agentSettings?.fastMode,
              })
            }
            disabled={isProcessing}
            className="app-primary-button flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition cursor-pointer disabled:opacity-40"
            title="Pedir resposta ao copiloto para a fala mais recente (Atalho: Alt+Space ou Ctrl+D)"
          >
            <Sparkles size={12} className="text-blue-600" />
            <span>Diga isso</span>
              <kbd className="hidden min-[380px]:inline-block px-1 py-0.2 rounded bg-black/10 border border-black/10 text-[9px] font-mono text-zinc-600">
              Alt+Space
            </kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
