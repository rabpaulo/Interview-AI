# Áudio e latência

Este documento descreve o fluxo atual. Com Antigravity ou um provedor por API key, o modo automático responde à fala enquanto ela acontece, como o Perssua: uma prévia aparece antes de a pergunta terminar e é substituída conforme o texto cresce. Codex, Claude Code e OpenCode respondem somente à transcrição consolidada.

## Da captura à resposta

1. O PC envia a primeira janela de áudio ao reconhecimento após cerca de 2 segundos. As próximas janelas, assim como as do microfone, usam aproximadamente 3 segundos, com 800 ms de sobreposição.
2. O texto parcial aparece na interface. Com Antigravity ou API key, um parcial com pelo menos 4 palavras inicia uma prévia no modo automático (veja "Prévias durante a fala").
3. Após 300 ms de pausa, o reconhecimento do trecho pendente pode começar. A fala continua aberta até completar 900 ms de silêncio.
4. Se o áudio voltar antes disso, os trechos continuam na mesma fala. Caso contrário, o app consolida a transcrição após concluir os pedidos de reconhecimento pendentes.
5. No modo automático, o agendador envia o texto consolidado ao copiloto, a menos que uma prévia já tenha respondido exatamente esse texto. O prompt inclui a persona, o contexto pessoal salvo e, se houver uma vault conectada, os trechos das notas encontrados para a fala.

A busca nas notas não chama o modelo nem uma ferramenta. Ela roda em memória, em poucos milissegundos, a cada transcrição parcial; o card aparece enquanto a pessoa ainda fala, e a fala consolidada só repete uma busca local antes do envio. Os trechos acrescentam até 2.000 caracteres ao prompt, e apenas quando há resultado.

O microfone finaliza ao soltar o push-to-talk ou parar a gravação e segue o fluxo de mensagem direta ao agente.

Os 900 ms são um critério de silêncio, não uma garantia de pergunta completa. Uma pausa longa pode dividir o enunciado. Áudio sem pausas é dividido após 30 s (45 s, no máximo, se não houver um ponto mais baixo). O botão **Diga isso** usa a última transcrição consolidada, sem recompor automaticamente uma pergunta dividida em vários trechos.

## Controle da espera

A transcrição processa os blocos em ordem, com fila limitada. Quando um bloco curto não é reconhecido, o sistema tenta ampliar o áudio com trechos vizinhos, até 10 segundos de contexto. Isso pode recuperar palavras cortadas, mas também adiciona uma tentativa de reconhecimento.

O copiloto mantém uma geração automática por vez. Se o modelo ficar para trás, a fala completa mais recente substitui respostas antigas ainda pendentes. As transcrições permanecem no histórico; encher a fila não reinicia o agente ativo.

Antigravity, Codex e Claude Code preparam e reutilizam sessões de processo. A preparação não envia uma pergunta. Cancelar uma resposta ou um erro durante a geração encerra o processo; o app inicia o substituto em seguida, com a mesma conversa, para que a próxima pergunta não espere o CLI iniciar. Reset e mudança de configuração preparam uma nova sessão.

Os CLIs rodam numa pasta vazia (`interviewai-agent` no diretório temporário do sistema), fora do projeto, para não carregar repositório, AGENTS.md ou CLAUDE.md. O Claude Code roda sem ferramentas, servidores MCP, plugins e skills, e o Claude Code e o Codex usam um system prompt curto no lugar do prompt de agente de código. O Antigravity desativa a expansão de comandos e skills; ele mantém as ferramentas, pois abre as capturas de tela como arquivos.

## Prévias durante a fala

No Perssua, a sugestão já está na tela quando o interlocutor termina a pergunta: a geração começa com a transcrição parcial e é refeita conforme a fala continua. O app segue o mesmo modelo quando cancelar uma geração é barato:

- Cada parcial maior inicia uma prévia com o mesmo prompt da resposta final e cancela a prévia anterior da mesma fala. O texto antigo continua visível até a nova chegar.
- Se a transcrição consolidada for igual ao texto da prévia, a prévia vira a resposta, sem nova geração. Isso é comum: o parcial gerado após 300 ms de pausa costuma ser o texto final.
- Se a transcrição final for diferente, a prévia é cancelada e a resposta final começa na hora. Uma resposta final nunca é cancelada por uma prévia da fala seguinte.
- Essas respostas rodam fora da conversa do CLI, como turnos avulsos; o prompt já leva as falas recentes. No Antigravity, o app mantém dois processos já iniciados para esses turnos, e uma prévia cancelada custa um processo, não uma inicialização de cerca de 4 s antes da próxima resposta. Mensagens diretas recebem as falas e sugestões feitas desde a mensagem anterior, que a conversa do CLI não viu.

Codex, Claude Code e OpenCode continuam respondendo somente à fala consolidada: lá, cancelar significa reiniciar o processo, e a pergunta completa esperaria a prévia descartada.

As prévias aumentam o número de pedidos ao provedor, em geral de dois a quatro por pergunta longa.

## Medir o provedor

Encerre o desktop para evitar chamadas concorrentes e execute um dos comandos:

```bash
AGY_BIN="$(command -v agy)" node scripts/measure-response-latency.js

CODEX_BIN="$(command -v codex)" LATENCY_PROVIDER=codex node scripts/measure-response-latency.js
```

O script usa duas chamadas por padrão. `LATENCY_RUNS` altera a quantidade; `LATENCY_MODEL` seleciona outro modelo. Os padrões atuais do script são `gemini-3.8-flash` para Antigravity e `gpt-5.6-luna` para Codex, com raciocínio `low` e Fast Mode habilitado nas opções. A disponibilidade depende da conta.

A saída contém tempo de preparação, tempo até o primeiro texto (`firstTextMs`), duração total (`totalMs`), contagens de eventos e caracteres. O processo retorna código 1 se uma resposta não produzir texto ou se o primeiro texto ultrapassar 3 segundos. Esse limite é um critério de diagnóstico, não um compromisso de desempenho.

O script ainda monta um prompt com `isPreview: true`, para respostas curtas. Portanto, mede geração com esse prompt específico, não reproduz integralmente o modo automático atual. Também não inclui captura, transcrição ou detecção de silêncio. Ele usa o provedor real e consome a cota da conta autenticada.

## Medições de 16 de outubro de 2026

Antigravity / Gemini 3.8 Flash, raciocínio `low`, medido com o CLI real:

| Cenário | Primeiro texto |
| --- | ---: |
| Prompt de uma palavra ("ok"), processo já iniciado | 2.139 a 3.029 ms |
| Prompt completo do copiloto (cerca de 3.700 tokens), mesma conversa, 6 perguntas | 2.167 a 3.824 ms |
| Prompt completo, processo novo já iniciado | 2.500 a 3.380 ms |
| Inicialização do processo | 3.569 a 4.870 ms |

O tamanho do prompt e o histórico da conversa quase não mudam o tempo: o piso de 2 a 3 s é do próprio CLI. Numa simulação de pergunta falada em 7 s, a prévia apareceu 5,9 s após o início da fala (antes, 10,3 s); a resposta à pergunta completa começou 3,0 a 3,2 s após o fim da fala (antes, 3,3 s). Abaixo disso, só um provedor com menor tempo até o primeiro token, como a API do Gemini com API key.

## Medições históricas

Amostras registradas em 9 de outubro de 2026, preservadas como referência. Não foram repetidas após as alterações de contexto pessoal e estilo dos prompts.

| Provedor/modelo | Primeiro pedido: primeiro texto | Segundo pedido: primeiro texto |
| --- | ---: | ---: |
| Antigravity / Gemini 3.8 Flash | 3.284 ms | 2.219 ms |
| Codex / GPT-5.6 Luna | 3.311 ms | 1.436 ms |

São amostras pequenas, medidas a partir do envio do prompt. Outros pedidos do Antigravity pelo endpoint do app tiveram primeiro texto em 2.353 e 9.912 ms. Essa variação impede afirmar uma latência estável ou comparar os provedores apenas por essa tabela.

Um teste com relógio controlado e reconhecimento simulado de 400 ms verifica que a transcrição pode ficar pronta ao terminar a pausa de 900 ms, pois o reconhecimento começa durante o silêncio. Isso valida a sobreposição das etapas; não mede a rede nem o modelo real.

## Diagnóstico

| Sintoma | O que verificar |
| --- | --- |
| Nenhuma transcrição do PC | Estado da captura, saída padrão de áudio, pactl e parec. |
| Erro ou demora no reconhecimento | Python com SpeechRecognition, acesso à internet, volume e ruído do áudio. |
| Transcrição termina no meio da pergunta | Pausas de 900 ms ou falha de reconhecimento; compare o texto com o áudio ouvido. |
| Texto pronto, mas resposta demora | Preparação do CLI, pedidos anteriores e tempo de geração do modelo. |
| Resposta genérica ou sem fatos pessoais | Contexto salvo e persona selecionada; mensagens diretas não anexam o contexto do copiloto. |
| Mudança de backend não aparece | Processo antigo reaproveitado na porta 3001; reinicie esse backend. |

Os testes relevantes estão em `server/response-latency.test.js`, `server/live-copilot.test.js`, `server/pc-live-integration.test.js` e `shared/streaming-transcription.test.js`. Execute-os pela suíte `npm test` ou individualmente com `node --test`.
