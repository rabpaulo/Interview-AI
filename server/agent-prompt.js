// Appended to every chat turn sent to an agent. The app renders the reply as
// markdown and turns consecutive code blocks into tabs (see src/components/agent-response.js).
export function agentResponseFormat(preferredLanguage = '') {
  const language = typeof preferredLanguage === 'string' && preferredLanguage.trim() ? preferredLanguage.trim() : 'Python';
  return `FORMATO DA RESPOSTA (o app renderiza Markdown numa janela estreita):
- Vá direto ao ponto: não repita o enunciado. Se a transcrição tiver palavras erradas, entenda a intenção sem comentar os erros.
- Em problemas de código: comece com 1 a 3 frases sobre a ideia da solução e a complexidade de tempo e espaço. Depois entregue UMA solução, na linguagem pedida ou em ${language} se nenhuma for mencionada. Não repita a solução em outras linguagens, a menos que peçam.
- Todos os blocos de código ficam juntos no fim da resposta, cada um logo após um título curto "#### Rótulo" (por exemplo "#### ${language}" e "#### Exemplo de uso"). O app mostra esses blocos em abas.
- Escreva complexidade como código inline (\`O(n)\`), sem LaTeX nem cifrões.
- Use parágrafos curtos, listas e **negrito** com moderação. Não use citações (>) nem linhas horizontais (---).`;
}

export const AGENT_RESPONSE_FORMAT = agentResponseFormat();

export function buildAgentPrompt(request, { preferredLanguage } = {}) {
  return `${request}\n\n${agentResponseFormat(preferredLanguage)}`;
}
