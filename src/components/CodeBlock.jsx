import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

export function CodeBlock({ code, language = 'javascript' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-800 bg-[#0d0d12] shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800/80 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-cyan-400" />
          <span className="font-mono uppercase font-semibold text-zinc-300">{language}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition text-xs cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copiado</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs sm:text-sm font-mono text-zinc-200 leading-relaxed">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

/**
 * Helper component that renders mixed markdown text and formatted code blocks
 */
export function FormattedAgentResponse({ text }) {
  if (!text) return null;

  // Split by markdown triple backtick blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-sm leading-relaxed text-zinc-200">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const firstLineEnd = part.indexOf('\n');
          let lang = 'code';
          let codeContent = '';

          if (firstLineEnd !== -1) {
            lang = part.slice(3, firstLineEnd).trim() || 'code';
            codeContent = part.slice(firstLineEnd + 1, -3);
          } else {
            codeContent = part.slice(3, -3);
          }

          return <CodeBlock key={index} code={codeContent} language={lang} />;
        }

        // Render standard paragraphs with bolding
        return (
          <div key={index} className="whitespace-pre-wrap">
            {part.split('\n\n').map((paragraph, pIdx) => (
              <p key={pIdx} className="mb-2 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
