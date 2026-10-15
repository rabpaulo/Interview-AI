// Appended to every chat turn sent to an agent. The app renders the reply as
// markdown and turns consecutive code blocks into tabs (see src/components/agent-response.js).
export function agentResponseFormat(preferredLanguage = '') {
  const preferred = typeof preferredLanguage === 'string' ? preferredLanguage.trim() : '';
  const language = preferred || 'Python';
  // The profile's language beats the editor shown in a screenshot (LeetCode keeps
  // its own language setting); only an explicit request in the message overrides it.
  const languageRule = preferred
    ? `em ${language}, mesmo que o editor de uma captura de tela esteja em outra linguagem. Use outra linguagem só se a mensagem pedir explicitamente`
    : `na linguagem pedida, na linguagem do editor de uma captura de tela ou em ${language} se nenhuma for mencionada`;
  return `FORMATO DA RESPOSTA (o app renderiza Markdown numa janela estreita):
- Vá direto ao ponto: não repita o enunciado. Se a transcrição tiver palavras erradas, entenda a intenção sem comentar os erros.
- Em problemas de código: comece com 1 a 3 frases sobre a ideia da solução e a complexidade de tempo e espaço. Depois entregue UMA solução, ${languageRule}. Não repita a solução em outras linguagens, a menos que peçam.
- Todos os blocos de código ficam juntos no fim da resposta, cada um logo após um título curto "#### Rótulo" (por exemplo "#### ${language}" e "#### Exemplo de uso"). O app mostra esses blocos em abas.
- Escreva complexidade como código inline (\`O(n)\`), sem LaTeX nem cifrões.
- Dentro de blocos de código use somente caracteres ASCII de teclado: \`!=\`, \`==\`, \`<=\`, \`>=\`, \`&&\`, \`||\`. Nunca use símbolos Unicode como ≠ ≤ ≥ nem comandos LaTeX como \\neq ou \\leq, mesmo que a pergunta ou a captura de tela use essa notação matemática.
- Use parágrafos curtos, listas e **negrito** com moderação. Não use citações (>) nem linhas horizontais (---).`;
}

export const AGENT_RESPONSE_FORMAT = agentResponseFormat();

export function buildAgentPrompt(request, { preferredLanguage } = {}) {
  return `${request}\n\n${agentResponseFormat(preferredLanguage)}`;
}

// Replaces the CLIs' coding-agent system prompt (Claude Code, Codex). Every turn
// carries its own instructions, so this only sets the role.
export const AGENT_SYSTEM_PROMPT = 'Você é o assistente do InterviewAI, um copiloto para entrevistas e reuniões. '
  + 'Responda em texto, seguindo as instruções e o formato pedidos em cada mensagem.';
