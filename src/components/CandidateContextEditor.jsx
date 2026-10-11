import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { composeCandidateContext, EXPERIENCE_FIELDS, INTERVIEW_FIELDS } from '../../shared/candidate-profile.js';

export function CandidateContextEditor({ initialContext = '', onSave, onClose }) {
  const [contextDraft, setContextDraft] = useState(initialContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [experience, setExperience] = useState({});
  const [interview, setInterview] = useState({});
  const preparedContext = composeCandidateContext(contextDraft, experience, interview);
  const tooLong = preparedContext.length > 6000;
  const requestRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  async function loadFile() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    setNotice('');
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/candidate-context/file', { signal: controller.signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o contexto.md.');
      if (typeof result.text !== 'string' || result.text.length > 6000) throw new Error('O arquivo recebido não é um contexto válido.');
      if (controller.signal.aborted) return;
      setContextDraft(result.text);
      setNotice('Arquivo carregado. Você pode editar o texto antes de salvar.');
    } catch (failure) {
      if (requestRef.current === controller) {
        setError(controller.signal.aborted ? 'A leitura demorou demais. Tente novamente.' : failure.message);
      }
    } finally {
      clearTimeout(timer);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  function startBlank() {
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
    setContextDraft('');
    setExperience({});
    setInterview({});
    setError('');
    setNotice('Escreva seu novo contexto. O anterior só será substituído ao salvar.');
    inputRef.current?.focus();
  }

  function includeExperience() {
    if (loading || tooLong) return;
    setContextDraft(composeCandidateContext(contextDraft, experience));
    setExperience({});
    setNotice('Experiência incluída no texto. Você pode adicionar outro exemplo antes de salvar.');
  }

  function guidedFields(fields, values, setValues, prefix) {
    return fields.map(({ key, label, placeholder }) => (
      <label key={key} htmlFor={`${prefix}-${key}`} className="block text-xs text-zinc-300">
        {label}
        <textarea
          id={`${prefix}-${key}`}
          value={values[key] || ''}
          onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))}
          disabled={loading}
          maxLength={6000}
          rows={2}
          placeholder={placeholder}
          className="app-text-input mt-1 w-full resize-y bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
        />
      </label>
    ));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!loading && !tooLong) onSave(preparedContext);
      }}
      className="app-context-editor absolute bottom-full left-3 right-3 mb-2 p-4 rounded-xl bg-[#101012] border border-white/[0.1] shadow-2xl z-40 max-h-[70vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="candidate-context" className="text-sm font-medium text-zinc-100">Meu contexto</label>
        <button type="button" onClick={() => onClose()} aria-label="Fechar meu contexto" className="p-1 text-zinc-400 hover:text-white cursor-pointer"><X size={16} /></button>
      </div>
      <p id="candidate-context-help" className="text-xs leading-relaxed text-zinc-400 mb-3">
        Descreva sua trajetória e exemplos reais. Os guias abaixo ajudam a detalhar experiências e preparar a vaga.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" onClick={loadFile} disabled={loading} className="app-quiet-button border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 cursor-pointer disabled:opacity-50">
          {loading ? 'Lendo arquivo…' : 'Carregar contexto.md'}
        </button>
        <button type="button" onClick={startBlank} className="app-quiet-button border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 cursor-pointer">
          Criar do zero
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500 mb-3">Importar preenche o rascunho. Revise antes de salvar; mudanças no arquivo exigem uma nova importação.</p>
      {error && <p role="alert" className="text-xs text-red-300 mb-3">{error}</p>}
      {notice && <p role="status" className="text-xs text-zinc-300 mb-3">{notice}</p>}
      <details className="mt-3 border-t border-white/10 pt-3">
        <summary className="text-xs font-medium text-zinc-200 cursor-pointer">Preparar uma experiência real</summary>
        <p className="text-[11px] leading-relaxed text-zinc-400 mt-2">Um exemplo pode ajudar em perguntas sobre iniciativa, colaboração e decisões técnicas. Preencha o que souber; os campos vazios são ignorados.</p>
        <div className="space-y-3 mt-3">
          {guidedFields(EXPERIENCE_FIELDS, experience, setExperience, 'experience')}
        </div>
        <button type="button" onClick={includeExperience} disabled={loading || tooLong || !Object.values(experience).some((value) => value.trim())} className="app-quiet-button mt-2 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 cursor-pointer disabled:opacity-50">
          Incluir experiência e preparar outra
        </button>
      </details>
      <details className="mt-3 border-t border-white/10 pt-3">
        <summary className="text-xs font-medium text-zinc-200 cursor-pointer">Preparar a entrevista atual</summary>
        <div className="space-y-3 mt-3">
          {guidedFields(INTERVIEW_FIELDS, interview, setInterview, 'interview')}
        </div>
      </details>
      <textarea
        ref={inputRef}
        id="candidate-context"
        aria-describedby="candidate-context-help candidate-context-storage"
        value={contextDraft}
        onChange={(event) => setContextDraft(event.target.value)}
        disabled={loading}
        maxLength={6000}
        rows={3}
        autoFocus
        placeholder="Inclua apenas fatos reais e exemplos que você consiga explicar na entrevista."
        className="app-text-input mt-3 w-full resize-y bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-sm leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
      />
      <div className="flex justify-between gap-3 mt-3 text-[11px] text-zinc-400">
        <span>Salvar também inclui os campos preenchidos acima.</span>
        <span className="shrink-0">{preparedContext.length.toLocaleString('pt-BR')} / 6.000</span>
      </div>
      {tooLong && <p role="alert" className="mt-2 text-xs text-red-300">O contexto completo ultrapassa 6.000 caracteres. Reduza o texto ou os exemplos para salvar.</p>}
      <p id="candidate-context-storage" className="text-[11px] leading-relaxed text-zinc-500 mt-2">
        Salvo neste dispositivo e enviado ao modelo com as próximas sugestões. Para remover, apague o texto e salve. Isso não apaga conversas anteriores.
      </p>
      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-3 flex justify-end gap-2 border-t border-white/10 bg-[#101012] px-4 py-3">
        <button type="button" onClick={() => onClose()} className="text-xs text-zinc-400 px-3 py-2 cursor-pointer">Cancelar</button>
        <button type="submit" disabled={loading || tooLong} className="app-primary-button bg-white text-black rounded-full px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50">Salvar contexto</button>
      </div>
    </form>
  );
}
