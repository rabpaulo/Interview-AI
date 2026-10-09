import React, { useState } from 'react';
import {
  X,
  Check,
  Briefcase,
  Code,
  Network,
  Users,
  HelpCircle,
  DollarSign,
  MessageSquare,
  Sparkles,
  Layers,
  Search,
} from 'lucide-react';
import { AVAILABLE_PERSONAS, PERSONA_CATEGORIES } from '../config/personas.js';

const ICON_MAP = {
  Code,
  Network,
  Users,
  Briefcase,
  HelpCircle,
  DollarSign,
  MessageSquare,
};

const COLOR_MAP = {
  purple: {
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    activeBg: 'bg-gradient-to-br from-purple-950/40 via-zinc-900/60 to-zinc-900/40',
    activeBorder: 'border-purple-500/60',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    dot: 'bg-purple-400',
  },
  indigo: {
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    activeBg: 'bg-gradient-to-br from-indigo-950/40 via-zinc-900/60 to-zinc-900/40',
    activeBorder: 'border-indigo-500/60',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
  },
  amber: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    activeBg: 'bg-gradient-to-br from-amber-950/40 via-zinc-900/60 to-zinc-900/40',
    activeBorder: 'border-amber-500/60',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  emerald: {
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    activeBg: 'bg-gradient-to-br from-emerald-950/40 via-zinc-900/60 to-zinc-900/40',
    activeBorder: 'border-emerald-500/60',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  cyan: {
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    activeBg: 'bg-gradient-to-br from-cyan-950/40 via-zinc-900/60 to-zinc-900/40',
    activeBorder: 'border-cyan-500/60',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    dot: 'bg-cyan-400',
  },
  rose: {
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    activeBg: 'bg-gradient-to-br from-rose-950/40 via-zinc-900/60 to-zinc-900/40',
    activeBorder: 'border-rose-500/60',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  blue: {
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    activeBg: 'bg-gradient-to-br from-blue-950/40 via-zinc-900/60 to-zinc-900/40',
    activeBorder: 'border-blue-500/60',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400',
  },
};

export function PersonaSelectorModal({
  isOpen,
  onClose,
  selectedPersona,
  onSelectPersona,
}) {
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredPersonas = AVAILABLE_PERSONAS.filter((p) => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.tag.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl rounded-3xl border border-zinc-800 bg-[#0e0e14] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Layers size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Modos & Tipos de Entrevista
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Perssua & Cody
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Selecione o perfil do copiloto para adaptar o raciocínio e o formato das respostas na chamada
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Pills & Search */}
        <div className="px-6 pt-4 pb-2 border-b border-zinc-800/60 bg-[#0c0c11] flex flex-col sm:flex-row items-center gap-3 justify-between">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer shrink-0 ${
                filterCategory === 'all'
                  ? 'bg-white text-black font-semibold'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              Todos ({AVAILABLE_PERSONAS.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory('interview')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer shrink-0 ${
                filterCategory === 'interview'
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              🎯 Entrevistas
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory('business')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer shrink-0 ${
                filterCategory === 'business'
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              💼 Negócios & Vendas
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory('general')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer shrink-0 ${
                filterCategory === 'general'
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              💬 Reunião Geral
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-48">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar modo..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Scrollable Personas List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
          {filteredPersonas.map((persona) => {
            const isSelected = selectedPersona === persona.id || (selectedPersona === 'interview' && persona.id === 'interview_coding');
            const IconComponent = ICON_MAP[persona.iconName] || MessageSquare;
            const style = COLOR_MAP[persona.badgeColor] || COLOR_MAP.blue;

            return (
              <div
                key={persona.id}
                onClick={() => {
                  onSelectPersona(persona.id);
                  onClose();
                }}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  isSelected
                    ? `${style.activeBorder} ${style.activeBg} shadow-lg shadow-purple-500/10`
                    : 'border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-850 hover:border-zinc-700'
                }`}
              >
                {/* Active Check Badge */}
                {isSelected && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}

                <div className="flex items-start gap-3.5">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${style.bg} ${style.border} ${style.text}`}
                  >
                    <IconComponent size={20} />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        {persona.name}
                      </h3>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.badge}`}
                      >
                        {persona.tag}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 mb-2 leading-relaxed">
                      {persona.description}
                    </p>

                    {/* How it outputs */}
                    <div className="text-[11px] text-zinc-400 bg-black/40 border border-white/[0.04] rounded-lg p-2 mb-2">
                      <span className="text-zinc-200 font-medium">📋 Formato: </span>
                      {persona.promptSummary}
                    </div>

                    {/* Example */}
                    {persona.exampleQuestion && (
                      <div className="text-[10px] text-zinc-500 italic">
                        Exemplo: {persona.exampleQuestion}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredPersonas.length === 0 && (
            <div className="text-center py-10 text-zinc-500 text-xs">
              Nenhum modo encontrado para "{searchTerm}".
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              Modo ativo:{' '}
              <strong className="text-white">
                {AVAILABLE_PERSONAS.find((p) => p.id === selectedPersona)?.name || 'Reunião Geral'}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition cursor-pointer text-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
