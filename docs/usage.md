# Guia de uso

## Preparar uma entrevista

Abra o app com `npm start`. No cabeçalho, selecione o provedor, o modelo, o nível de raciocínio e a persona adequada: conversa geral, entrevista técnica, arquitetura, comportamental, RH, perguntas ao entrevistador ou vendas.

O app prepara a sessão do agente sem enviar uma pergunta. A disponibilidade dos modelos depende do CLI e da conta autenticada; o seletor contém uma lista definida no projeto.

## Meu contexto

O ícone de pessoa na barra inferior abre o editor. Inclua fatos que possam sustentar suas respostas: função atual, tecnologias, projetos, resultados e preferências de trabalho. Um texto curto com dois exemplos concretos costuma ser suficiente para começar.

| Ação | Comportamento |
| --- | --- |
| Carregar contexto.md | Lê o arquivo na raiz do projeto e preenche o rascunho. |
| Criar do zero | Limpa o rascunho para escrever outro contexto. |
| Salvar contexto | Aplica o texto às próximas sugestões do copiloto. |
| Cancelar ou fechar | Descarta a edição e preserva o contexto salvo. |

O editor aceita até 6.000 caracteres. A importação informa erro se o arquivo estiver ausente, vazio, inacessível ou acima do limite; o rascunho anterior é preservado. O app não escreve no arquivo ao salvar e não acompanha alterações nele automaticamente.

O contexto salvo fica no armazenamento local do frontend e é sincronizado com o backend. Ele acompanha os pedidos de **Diga isso**, tanto automáticos quanto manuais. Mensagens digitadas e mensagens do microfone seguem o fluxo direto do agente, sem acrescentar esse campo ao prompt de cada pedido.

Para deixar de anexar o contexto, apague o texto e salve. Isso não remove informações já enviadas à conversa do provedor. **Nova Sessão** reinicia a conversa no app, mas mantém o contexto e as preferências salvas. Se quiser começar sem os dados anteriores, limpe o contexto e inicie uma nova sessão.

O arquivo `contexto.md` permanece fora do Git. As preferências locais dependem da origem usada pelo frontend: abrir por outra porta ou alternar entre desenvolvimento e build pode apresentar outro armazenamento local.

## Áudio e respostas

A captura do PC usa a saída de áudio padrão e tenta iniciar quando o app abre. Os medidores permitem acompanhar e controlar a captura. A transcrição parcial aparece enquanto a pessoa fala, mas o modo automático só envia a fala consolidada ao modelo.

Após cerca de 900 ms de silêncio, o app encerra o trecho. Uma pausa no meio da pergunta também pode encerrá-lo: a detecção é baseada em áudio, sem análise semântica do fim da pergunta. Se isso atrapalhar a entrevista, desative o modo automático e use **Diga isso** após conferir a transcrição. O botão usa a última fala consolidada; ele não junta automaticamente vários trechos.

O microfone grava uma mensagem para o agente. Clique para iniciar e parar, ou segure **Espaço** e solte para enviar. Digitar pelo botão de teclado também envia uma mensagem direta ao agente.

**Diga isso** pede uma fala pronta para responder ao interlocutor, em tom profissional e conversacional. O prompt orienta o modelo a usar fatos disponíveis e não inventar experiências. Sem contexto pessoal suficiente, a sugestão pode ser apenas uma abertura breve; não substitui uma resposta baseada na sua trajetória.

## Atalhos

| Atalho | Ação | Disponibilidade |
| --- | --- | --- |
| Alt+Space ou Ctrl+D | Pedir uma sugestão para a última fala | Global no Electron |
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
