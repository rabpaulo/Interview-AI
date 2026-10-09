# Otimização das respostas — 9 de outubro de 2026

## Quinta rodada: aguardar a fala consolidada antes de responder

O envio antecipado foi reproduzido com `node --test --test-name-pattern='incomplete PC speech' server/live-copilot.test.js`: após uma parcial de uma pergunta ainda em andamento, havia um pedido de IA quando o esperado era zero. O agendador aceitava três palavras e 12 caracteres, aguardando apenas 100 ms. Isso permitia responder sem o restante da pergunta; se a geração ainda estivesse em andamento, a pergunta completa precisava esperar por ela.

O agendador agora aceita somente transcrições finais. As parciais continuam aparecendo durante a fala e o reconhecimento continua antecipado, inclusive após 300 ms de pausa. A pausa de 900 ms continua consolidando a fala; não foi acrescentado outro debounce antes de chamar a IA. O limite de uma geração por vez, cancelamento e substituição de respostas pendentes antigas foram preservados.

O teste de regressão verifica zero gerações durante a fala e uma geração com a pergunta completa na consolidação. A integração com backend, áudio, reconhecimento e CLI simulados verifica que `copilot_started` só aparece depois de `pc_speech_transcribed`, com `isPreview: false`. Os testes de retomada durante uma pausa curta e reaproveitamento do reconhecimento também continuam passando.

Essa correção substitui as sugestões provisórias descritas nas rodadas anteriores. Não mede nem garante redução da latência do provedor real. A detecção de fim de fala ainda é baseada em silêncio: uma pausa de 900 ms no meio de uma pergunta pode encerrar o trecho; ela não representa uma detecção semântica de pergunta completa.

## Quarta rodada: reduzir a espera inicial e a fila de respostas

O novo relato foi reproduzido em duas frentes. Uma observação do WebSocket do desktop mostrou primeiras atualizações de IA após 2,6–3,0 segundos de geração e uma resposta pendente por mais de 11 segundos. O teste `node --test --test-name-pattern="within two seconds" server/response-latency.test.js` falhou porque não havia nenhum pedido de reconhecimento após dois segundos de áudio contínuo. Outros testes reproduziram a pergunta atual esperando atrás de respostas antigas e o agente ativo sendo encerrado quando a fila enchia.

Correções desta rodada:

- O PC envia a primeira janela com 2 segundos de áudio, mantendo janelas seguintes de 3 segundos e sobreposição de 800 ms. Isso antecipa o primeiro reconhecimento em 1 segundo sem aumentar a frequência sustentada de pedidos. O microfone mantém seu tamanho de janela anterior.
- Uma abertura de pelo menos três palavras e 12 caracteres já pode iniciar uma sugestão provisória; antes eram cinco palavras e 24 caracteres. A espera adicional passou de 400 para 100 ms. Atualizações seguintes mantêm o intervalo mínimo de três segundos.
- Se a IA não acompanha a conversa, a fala mais recente substitui respostas antigas ainda pendentes. O histórico das transcrições é preservado. Eventos atrasados não restauram pedidos descartados; encher a fila não encerra o agente ativo nem obriga a reinicializá-lo.
- Sugestões provisórias pedem uma ou duas frases. O prompt instrui o agente a responder pelo contexto da conversa sem pesquisar, ler arquivos ou executar ferramentas. A medição não demonstrou ganho isolado no primeiro token por essa mudança de prompt.
- O Vite ignora alterações em backend, documentação e testes para não recarregar o renderer e reiniciar a captura durante o diagnóstico. O backend continua exigindo reinício explícito.

### Medições reais, sem captura concorrente

O comando `node scripts/measure-response-latency.js` prepara o agente e envia dois pedidos de teste pela assinatura existente. `LATENCY_PROVIDER=codex` seleciona Codex; ambos usam raciocínio Low e o Codex usa o Fast Mode já disponível. Feche o desktop antes de executar para evitar pedidos concorrentes. O script retorna erro se algum primeiro texto ultrapassar 3 segundos; esse limite é diagnóstico, não uma garantia do provedor. Ele registra tempos e contagens, sem conteúdo de reunião. Os pedidos consomem a cota incluída.

| Provedor/modelo, prompt revisado | Primeiro pedido: primeiro texto | Segundo pedido: primeiro texto |
| --- | ---: | ---: |
| Antigravity / Gemini 3.8 Flash | 3.284 ms | 2.219 ms |
| Codex / GPT-5.6 Luna | 3.311 ms | 1.436 ms |

Com o prompt anterior, o Codex teve 2.929 e 1.336 ms. Um teste do Antigravity enquanto o app também estava capturando teve 2.172 e 12.834 ms; outra preparação atingiu o timeout de 30 segundos. Esses testes concorrentes não isolam a causa da variação e não devem ser usados como comparação limpa entre modelos.

Depois de reabrir o desktop com as correções, dois pedidos pelo endpoint real do copiloto tiveram primeiro texto em **2.353 e 9.912 ms**, com conclusão em 2.810 e 13.406 ms. A captura foi pausada durante os pedidos e restaurada ao terminar. Uma observação posterior de 25 segundos do áudio do PC não teve novas falas, portanto não produziu medição do início da fala até a primeira sugestão. A sessão do Antigravity havia atingido o timeout de preparação de 30 segundos; uma nova tentativa, sem pergunta, ficou pronta em 4.391 ms. O teste com a variável herdada `ELECTRON_RUN_AS_NODE=1` também preparou em 4.670 ms, não confirmando essa variável como causa do travamento.

A amostra é pequena e a rede varia. Os tempos acima começam no envio do prompt, **não** no início da fala: a primeira janela de áudio e o reconhecimento ainda se somam ao tempo de IA. As correções retiram 1,3 segundo de espera configurada no caminho inicial elegível, mas não estabelecem esse mesmo ganho em chamadas reais nem garantem resposta instantânea. A divisão curta pode exigir recuperação de contexto quando o serviço não entende o primeiro trecho.

Validação: **84 testes offline passaram**, incluindo testes que falharam antes das correções de janela, fila, mínimo de palavras e reinício do agente. Build e verificações de sintaxe passaram. O desktop foi reaberto na mesma origem de suas preferências salvas. Nenhuma API paga ou cobrança extra foi habilitada.

## Terceira rodada: preparar o agente ao iniciar a sessão

Ao iniciar o backend, sincronizar as configurações do app ou criar uma nova sessão, o provedor selecionado inicia seu processo e prepara uma conversa vazia. O Antigravity aguarda o evento `init` em `stream-json`; o Codex usa o protocolo `app-server`, com `initialize`, `initialized` e `thread/start`. A primeira pergunta chama o mesmo processo e a mesma conversa. Pedidos seguintes mantêm o processo aberto até reset, cancelamento, erro, troca de configuração ou encerramento do app. A preparação não envia uma pergunta nem inicia geração de modelo, e não aparece como uma resposta no histórico.

Configurações idênticas recebidas por HTTP e WebSocket reutilizam a preparação. O botão de nova sessão agora envia apenas um reset, usando WebSocket quando disponível e HTTP como fallback. Resets durante a inicialização invalidam callbacks antigos para impedir que o ID anterior volte à sessão nova. Trocas de modelo, raciocínio ou Fast Mode preparam a configuração escolhida, preservando a conversa do provedor quando há um ID para retomar. Reconexões sincronizam novamente as preferências do cliente.

Em uma verificação real com os CLIs autenticados, sem enviar prompts, a preparação levou **2.585 ms no Antigravity** e **1.449 ms no Codex**. Uma pergunta curta ao Codex já preparado retornou “pronto” em **2.833 ms**, usando o mesmo PID. São amostras individuais; não medem ganho médio nem eliminam a latência de rede ou geração. Esse único pedido consumiu a cota da assinatura já autenticada.

Referências: [Codex App Server](https://learn.chatgpt.com/docs/app-server) e [Antigravity Headless mode](https://antigravity.google/docs/cli/headless/). Os testes offline verificam a preparação sem pergunta, reutilização no primeiro pedido e nos seguintes, resets por HTTP e WebSocket, troca de provedor, deduplicação de configurações, reset durante inicialização, erros e cancelamento.

Validação desta rodada: **79 testes passaram**, incluindo integração do backend e o fluxo de áudio existente. `npm run build`, verificações de sintaxe e `git diff --check` passaram. O app não estava rodando durante a conclusão; a preparação será ativada na próxima abertura.

## Segunda rodada: sugestões durante áudio contínuo do PC

A primeira rodada abaixo ainda aguardava a pausa para chamar a IA. O relato seguinte mostrou que isso obrigava a pessoa a ficar em silêncio. Agora o modo automático do PC chama a IA com transcrições parciais suficientemente longas e mostra uma **sugestão ao vivo**, enquanto a fala continua. A primeira sugestão depende do primeiro bloco reconhecido (aproximadamente três segundos de áudio), da rede e da geração do modelo; não há promessa de resposta instantânea.

Há um único pedido de IA por vez. Atualizações recebidas durante a geração ficam reunidas no texto mais recente; não interrompem o modelo a cada bloco. Pedidos parciais têm intervalo mínimo de três segundos. A resposta final, se diferente, é processada após o pedido em andamento; se idêntica, reaproveita a prévia. O mesmo cartão é atualizado e o histórico mantém a transcrição antes da resposta. Parar a captura, cancelar, trocar a configuração ou reiniciar a sessão descarta prévias pendentes e ignora callbacks antigos.

O fluxo foi validado de ponta a ponta com um backend em porta isolada, captura contínua, transcritor e CLI simulados offline: o WebSocket emitiu `copilot_completed` com `isPreview: true`, sem nenhum `pc_speech_end`. Esses testes não representam a velocidade da rede ou do modelo real. As atualizações ao vivo podem consumir mais cota incluída; nenhuma opção de cobrança extra foi ativada.

Na segunda rodada, `npm test` passou com 60 testes, incluindo o fluxo completo do backend; `npm run build`, verificações de sintaxe e `git diff --check` também passaram. O desktop e seu backend foram reiniciados para aplicar o novo fluxo. Antes do reinício, a seleção feita pelo usuário era Antigravity, Gemini 3.8 Flash, raciocínio `high` e modo automático ativo.

Recomendação para experimentar respostas curtas em reunião: **Antigravity → Gemini 3.8 Flash → Low**. O modelo já foi testado com a assinatura desta conta, e o processo pode ser reaproveitado. O nível Low é uma recomendação de configuração; esta rodada não trocou automaticamente a seleção salva do usuário. A [documentação do Gemini 3.8 Flash](https://www.antigravity.google/blog/gemini-3-8-flash-in-google-antigravity) confirma o ajuste dos níveis de raciocínio para controlar profundidade e latência.

## Primeira rodada: sobrepor reconhecimento e pausa

O áudio do PC inicia o reconhecimento da última parte da fala durante a pausa. Após 300 ms de silêncio, o trecho pendente pode ser enviado ao transcritor. A decisão de encerrar a frase continua esperando 900 ms. Se a pessoa voltar a falar, o app mantém a mesma frase e preserva a sobreposição de áudio. Cliques curtos continuam sendo descartados; parar a captura cancela o reconhecimento e os temporizadores.

O Antigravity agora mantém um processo CLI aberto para pedidos consecutivos da mesma conversa. Cada `result` conclui um pedido, sem esperar o processo encerrar. Trocar modelo ou raciocínio, começar outra conversa, cancelar ou encontrar um erro invalida o processo. Após cinco minutos sem pedidos, o processo é liberado; o ID permite retomar a conversa depois. O app mostra duração e uso de tokens por pedido, convertendo os contadores cumulativos enviados pelo CLI. O protocolo é documentado em [Headless mode — Google Antigravity](https://antigravity.google/docs/cli/headless/).

O Codex continua usando `codex exec`; sua inicialização por pedido ainda não foi otimizada. A antecipação da transcrição do PC beneficia ambos os provedores. Os modelos, níveis de raciocínio e preferências de Fast Mode não foram alterados.

## Medições

Teste determinístico da cadeia real de detecção de fala e consolidação, com um transcritor simulado que demora 400 ms:

| Etapa após parar de falar | Antes | Depois |
| --- | ---: | ---: |
| Texto final disponível para iniciar a IA | 1.300 ms | 900 ms |

Esse resultado mede a sobreposição entre reconhecimento e pausa. Não mede a latência real do Google nem o tempo total de uma resposta da IA. Com a pausa padrão, é possível sobrepor até aproximadamente 600 ms de reconhecimento.

Teste real de quatro pedidos curtos usando a assinatura já autenticada, Gemini 3.8 Flash e raciocínio `high`. O prompt pediu somente “pronto”, sem ferramentas ou leitura de arquivos:

| Fluxo | Primeiro texto | Pedido concluído |
| --- | ---: | ---: |
| Processo novo, primeiro pedido | 6.327 ms | 6.924 ms |
| Processo novo, retomando a conversa | 5.188 ms | 5.831 ms |
| Processo persistente, primeiro pedido | 5.632 ms | 5.734 ms |
| Processo persistente, pedido seguinte | 2.093 ms | 2.144 ms |

O segundo pedido persistente usou o mesmo PID do primeiro. Trata-se de uma amostra pequena, sujeita à variação da rede e do provedor; não é uma promessa de latência nem uma média estatística. Os pedidos consumiram a cota incluída da assinatura.

## Verificação

`npm test`: 46 testes passaram, incluindo retomada de fala, preservação dos samples de áudio, ausência de resposta antecipada, cancelamento, reutilização de processo, troca de configuração e recuperação de erros. `npm run build`, verificações de sintaxe e `git diff --check` passaram.

Os testes do bridge usam `server/fixtures/agy-session.cjs`, um provedor simulado offline. Não chamam modelos nem consomem cota. No ambiente de execução desta conversa, esses testes precisaram rodar fora do sandbox porque ele não entregava stdout dos processos filhos.

O backend foi reiniciado e o aplicativo Electron reaberto. O renderer conectou ao WebSocket; a seleção salva foi preservada: Codex, GPT-5.6 Luna, raciocínio `low`, Fast Mode já ativo. Um pedido curto enviado pelo fluxo do copiloto retornou “pronto”, com primeiro texto em 3.071 ms e conclusão em 4.715 ms. Esse teste confirma funcionamento; não demonstra ganho na geração do Codex, pois não há comparação anterior equivalente. A captura do PC voltou a ficar ativa.

Nenhuma API paga, compra de créditos ou opção de cobrança extra foi habilitada. O CLI do Antigravity pode remover `useG1Credits: false` ao salvar seu perfil, pois persiste apenas valores diferentes do padrão, conforme [Settings — Google Antigravity](https://antigravity.google/docs/settings/). Isso não equivale a ligar a opção; a configuração foi explicitamente deixada em `false` ao concluir o trabalho.
