import React from 'react';
import { Mic, MessageSquare, FileText, Sparkles } from 'lucide-react';

export function CompactTabs({ activeTab, setActiveTab, countMessages = 0 }) {
  const tabs = [
    { id: 'transcription', label: 'Transcrição', icon: Mic },
    { id: 'session', label: 'Sessão', icon: MessageSquare, badge: countMessages > 0 ? countMessages : null },
    { id: 'summary', label: 'Resumo', icon: FileText },
  ];

  return (
    <div className="app-tabs flex items-center justify-between px-4 py-2 select-none">
      <div className="flex items-center gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                isActive
                  ? 'app-tab-active text-white font-semibold'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={12} className={isActive ? 'text-blue-300' : 'text-zinc-500'} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-blue-500/15 text-blue-200' : 'bg-white/10 text-zinc-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Perssua live pulse indicator */}
      <div className="flex items-center gap-1.5 pr-1">
          <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-40" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
        </span>
        <span className="text-[10px] text-zinc-500 font-medium hidden min-[380px]:inline">Ao vivo</span>
      </div>
    </div>
  );
}
