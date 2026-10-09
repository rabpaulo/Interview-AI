# Áudio e latência

Este documento descreve o fluxo atual. As sugestões antecipadas durante a fala, usadas em versões anteriores, foram desativadas: somente uma transcrição consolidada pode iniciar uma resposta automática.

## Da captura à resposta

1. O PC envia a primeira janela de áudio ao reconhecimento após cerca de 2 segundos. As próximas janelas, assim como as do microfone, usam aproximadamente 3 segundos, com 800 ms de sobreposição.
2. O texto parcial aparece na interface, sem iniciar uma geração de IA.
3. Após 300 ms de pausa, o reconhecimento do trecho pendente pode começar. A fala continua aberta até completar 900 ms de silêncio.
4. Se o áudio voltar antes disso, os trechos continuam na mesma fala. Caso contrário, o app consolida a transcrição após concluir os pedidos de reconhecimento pendentes.
5. No modo automático, o agendador envia o texto consolidado ao copiloto. O prompt inclui a persona e o contexto pessoal salvo.

O microfone finaliza ao soltar o push-to-talk ou parar a gravação e segue o fluxo de mensagem direta ao agente.

Os 900 ms são um critério de silêncio, não uma garantia de pergunta completa. Uma pausa longa pode dividir o enunciado. O botão **Diga isso** usa a última transcrição consolidada, sem recompor automaticamente uma pergunta dividida em vários trechos.

## Controle da espera

A transcrição processa os blocos em ordem, com fila limitada. Quando um bloco curto não é reconhecido, o sistema tenta ampliar o áudio com trechos vizinhos, até 10 segundos de contexto. Isso pode recuperar palavras cortadas, mas também adiciona uma tentativa de reconhecimento.

O copiloto mantém uma geração automática por vez. Se o modelo ficar para trás, a fala completa mais recente substitui respostas antigas ainda pendentes. As transcrições permanecem no histórico; encher a fila não reinicia o agente ativo.

Antigravity e Codex preparam e reutilizam sessões de processo. A preparação não envia uma pergunta. Cancelamento, reset, erro ou mudança de configuração podem exigir uma nova preparação.

Enviar parciais à IA foi removido porque gerava respostas sem o restante da pergunta e fazia o texto completo esperar uma geração prematura terminar. A correção elimina esse trabalho especulativo, mas não reduz por si só a latência da rede ou do modelo.

## Medir o provedor

Encerre o desktop para evitar chamadas concorrentes e execute um dos comandos:

```bash
AGY_BIN="$(command -v agy)" node scripts/measure-response-latency.js

CODEX_BIN="$(command -v codex)" LATENCY_PROVIDER=codex node scripts/measure-response-latency.js
```

O script usa duas chamadas por padrão. `LATENCY_RUNS` altera a quantidade; `LATENCY_MODEL` seleciona outro modelo. Os padrões atuais do script são `gemini-3.8-flash` para Antigravity e `gpt-5.6-luna` para Codex, com raciocínio `low` e Fast Mode habilitado nas opções. A disponibilidade depende da conta.

A saída contém tempo de preparação, tempo até o primeiro texto (`firstTextMs`), duração total (`totalMs`), contagens de eventos e caracteres. O processo retorna código 1 se uma resposta não produzir texto ou se o primeiro texto ultrapassar 3 segundos. Esse limite é um critério de diagnóstico, não um compromisso de desempenho.

O script ainda monta um prompt com `isPreview: true`, para respostas curtas. Portanto, mede geração com esse prompt específico, não reproduz integralmente o modo automático atual. Também não inclui captura, transcrição ou detecção de silêncio. Ele usa o provedor real e consome a cota da conta autenticada.

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
