# Guia de uso

## Preparar uma entrevista

Abra o app com `npm start`. No menu (☰) da barra inferior, selecione em **Modelo** o provedor, o modelo e o nível de raciocínio, e em **Modo** a persona adequada: conversa geral, entrevista técnica, arquitetura, comportamental, RH, perguntas ao entrevistador ou vendas.

O app prepara a sessão do agente sem enviar uma pergunta. A disponibilidade dos modelos depende do CLI e da conta autenticada; o seletor contém uma lista definida no projeto.

## Meu contexto

O ícone de pessoa na barra inferior abre o editor em tela cheia. Um ponto azul no ícone indica que o perfil ainda está vazio. Preencha apenas fatos que você consiga sustentar na entrevista; campos vazios são ignorados.

| Aba | Campos |
| --- | --- |
| Perfil | Nome, cargo atual, anos de experiência, nível, **linguagem preferida**, tecnologias (Enter ou vírgula para adicionar) e resumo profissional. |
| Experiências | Até 8 histórias reais, cada uma com título e descrição (problema, o que você fez, resultado). |
| Vaga | Empresa, vaga, requisitos e motivação. **Limpar vaga** apaga só essa aba, para a próxima entrevista. |
| Extras | Notas livres (pretensão, disponibilidade, inglês…), **Importar contexto.md** e a prévia do texto enviado à IA. |

A linguagem preferida (por exemplo, TypeScript) vira o padrão das soluções de código no chat e é citada nas sugestões faladas, a menos que a pergunta peça outra linguagem.

**Salvar** (ou Ctrl+S) grava todas as abas de uma vez. Fechar com alterações pendentes pede confirmação antes de descartar. O contexto completo aceita até 8.000 caracteres; o contador fica no rodapé.

O perfil é salvo pelo backend em `~/.local/share/interviewai/profile.json` (ou `$XDG_DATA_HOME/interviewai/profile.json`). O arquivo fica fora dos dados do Electron e do armazenamento do navegador, então continua disponível ao reiniciar o app, iniciar uma **Nova Sessão**, limpar os dados do app, trocar entre desenvolvimento e AppImage ou reinstalar. A variável `INTERVIEWAI_PROFILE_PATH` troca o local. Um contexto salvo por versões anteriores no armazenamento local é migrado automaticamente para as notas na primeira abertura.

O contexto acompanha os pedidos de **Diga isso**, tanto automáticos quanto manuais. Mensagens digitadas e do microfone seguem o fluxo direto do agente e recebem apenas a linguagem preferida.

Para deixar de anexar o contexto, limpe os campos e salve. Isso não remove informações já enviadas à conversa do provedor. **Importar contexto.md** acrescenta o arquivo da raiz do projeto às notas; o app não escreve nesse arquivo e não acompanha alterações nele.

## Áudio e respostas

A captura do PC usa a saída de áudio padrão e tenta iniciar quando o app abre. Os medidores permitem acompanhar e controlar a captura. A transcrição parcial aparece enquanto a pessoa fala, mas o modo automático só envia a fala consolidada ao modelo.

Após cerca de 900 ms de silêncio, o app encerra o trecho. Uma pausa no meio da pergunta também pode encerrá-lo: a detecção é baseada em áudio, sem análise semântica do fim da pergunta. Se isso atrapalhar a entrevista, desative o modo automático e use **Diga isso** após conferir a transcrição. O botão usa a última fala consolidada; ele não junta automaticamente vários trechos.

O microfone grava uma mensagem para o agente. Clique para iniciar e parar, ou segure **Espaço** e solte para enviar. Digitar pelo botão de teclado também envia uma mensagem direta ao agente.

**Diga isso** pede uma fala pronta para responder ao interlocutor, em tom profissional e conversacional. Perguntas técnicas usam conhecimento geral mesmo quando o assunto não aparece no perfil. Perguntas hipotéticas recebem uma proposta no condicional, com passos e justificativa. Para experiências passadas, o modelo deve usar somente fatos informados: pode aproveitar uma experiência relacionada e indicar uma abordagem hipotética, sem transformar isso em uma história real. Dados pessoais ausentes, como salário ou disponibilidade, continuam exigindo confirmação.

O backend mantém uma janela limitada de falas consolidadas do PC e mensagens enviadas por texto ou microfone, inclusive com o modo automático desligado. Essa janela acompanha as sugestões para dar sentido a perguntas como “por quê?” ou “nesse projeto?”. Respostas da IA não são armazenadas nessa memória como fatos pessoais. Ela fica em memória durante a sessão, é compartilhada na troca de provedor e é apagada por **Nova Sessão** ou ao reiniciar o backend. O microfone continua sendo uma mensagem manual ao agente; ele não registra continuamente tudo o que você diz na chamada.

## Atalhos

| Atalho | Ação | Disponibilidade |
| --- | --- | --- |
| Alt+Space | Alternar microfone | Global no Electron e app em foco |
| Ctrl+D | Pedir uma sugestão para a última fala | Global no Electron |
| Ctrl+B | Ocultar ou mostrar a janela | Global no Electron |
| Alt+Shift+P | Alternar captura do PC | Global no Electron |
| Alt+Shift+M | Alternar microfone | Global no Electron |
| Alt+Shift+N | Iniciar nova sessão | Global no Electron |
| Alt+N ou Ctrl+Shift+R | Iniciar nova sessão | App em foco |
| Espaço, segurando | Gravar pelo microfone; soltar envia | App em foco, fora de campos de texto |

Atalhos globais podem conflitar com o ambiente desktop. Os botões da interface continuam disponíveis.

## Dados e limites

O reconhecimento usa o serviço Google por meio da biblioteca Python `SpeechRecognition`. Portanto, a transcrição não é offline. O texto reconhecido e o contexto salvo são enviados ao provedor quando uma sugestão é solicitada.

Os CLIs usam a autenticação já configurada na máquina. O fluxo de mensagens diretas pode executar ferramentas do agente; a instrução para responder sem ferramentas pertence ao prompt do copiloto, não é um isolamento de segurança.

Erros de reconhecimento aparecem na interface e impedem o envio daquela transcrição incompleta. Rede lenta, fila de reconhecimento e geração do modelo podem aumentar a espera. Consulte o [diagnóstico de latência](response-latency.md).
