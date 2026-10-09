# Perssua Code Copilot 🎙️⚡ (Aplicativo Desktop)

> Aplicativo de desktop nativo (Electron) inspirado no [Perssua](https://perssua.com/pt) adaptado para agentes de programação autônomos (**Google Antigravity / DeepMind Gemini / Codex**).

O **Perssua Code** funciona como um widget flutuante de desktop que fica sempre visível no canto da sua tela: ele captura áudio do seu microfone e do sistema (reuniões/calls do PC via loopback PipeWire/PulseAudio), transcreve em tempo real e fornece respostas ideais ("Diga isso") e execuções de comandos de código via **Antigravity CLI (`agy`)**.

---

## ✨ Funcionalidades do Aplicativo Desktop

- 🪟 **Janela Flutuante Compacta & Frameless (Electron)**:
  - Widget nativo minimalista e compacto (~440px) no canto da sua área de trabalho.
  - Fixação no topo (**Always-on-Top**) com um clique ou atalho, ideal para reuniões, entrevistas técnicas ou pair-programming.
  - Controles nativos de janela (minimizar, fechar, fixar) e cabeçalho arrastável (*draggable header*).
  - Cabeçalho estilo *Notch* com cronômetro da sessão, status em tempo real e seletor rápido de modelo de IA.

- 🎙️ **Captura de Áudio Dupla (Microfone + Loopback do PC)**:
  - Captura direta do microfone do usuário e áudio do sistema (outros participantes em reuniões/calls).
  - Medidores visuais de decibéis em tempo real (**VOCÊ**, **PC CALL** e **AGENTE**).
  - **Push-to-Talk**: Pressione e segure <kbd>ESPAÇO</kbd> para falar comandos rápidos.
  - **Transcrição durante a fala**: o PC envia seu primeiro WAV com 2 segundos de áudio; os seguintes e os do microfone usam janelas de aproximadamente 3 segundos, com 800 ms de sobreposição. No PC, os trechos reconhecidos aparecem ao vivo na transcrição; o modo automático só chama a IA depois de consolidar a fala, para não responder a perguntas incompletas. A transcrição final é consolidada após 900 ms de pausa no PC ou ao soltar/parar o microfone.
  - A primeira parcial depende da janela inicial de áudio e do tempo de resposta do serviço. Trechos são processados em ordem, com fila limitada e cancelamento ao parar a captura/reiniciar a sessão. A transcrição é incremental por blocos, usa internet e não precisa de uma nova chave de API.
  - Se uma divisão curta não for entendida, o app amplia o contexto com o trecho vizinho (até 10 segundos), removendo a sobreposição de áudio. Só informa falha de reconhecimento se a recuperação também não conseguir transcrever; erros de conexão continuam sendo informados imediatamente.
  - As respostas automáticas usam um único pedido por vez e recebem apenas a transcrição consolidada. Quando o modelo fica atrasado, a fala completa mais recente substitui respostas antigas ainda não geradas, preservando as transcrições no histórico. Encher a fila não reinicia o agente ativo. Trechos parciais não consomem pedidos de IA.
  - Durante uma pausa no PC, o reconhecimento do trecho final pode começar após 300 ms de silêncio. Os 900 ms consolidam a frase e a sugestão final.

- ⚡ **Atalhos Globais de Teclado**:
  - <kbd>Alt+Space</kbd> ou <kbd>Ctrl+D</kbd>: Dispara o copiloto ("Diga isso") imediatamente para a última fala.
  - <kbd>Ctrl+B</kbd>: Oculta / exibe a janela do aplicativo na tela.
  - <kbd>Alt+Shift+P</kbd>: Alterna a captura de áudio do sistema (PC).
  - <kbd>Alt+Shift+M</kbd>: Alterna o microfone.

- 📑 **Abas em Tempo Real**:
  - **Transcrição**: Feed com balões de fala ("Você", "PC / Reunião") e cartões destacados de **Diga isso** com sugestões ideais da IA prontas para copiar.
  - **Sessão**: Histórico organizado de perguntas e respostas da conversa.
  - **Resumo**: Síntese executiva dos tópicos e decisões geradas com IA em um clique.

- 🤖 **Integração com Motores de IA**:
  - Integração nativa com **Antigravity CLI (`agy`)** e **Codex CLI**.
  - Streaming de tokens em tempo real com blocos de código formatados.
  - Suporte a modelos como Gemini 3.8 Flash (High), Gemini 3.1 Pro, Fast Mode e níveis de raciocínio.
  - Ao abrir o app ou iniciar uma nova sessão, o agente selecionado já prepara a conversa e fica aguardando a primeira pergunta. Antigravity e Codex mantêm o processo aberto entre pedidos; o Codex usa uma thread persistente via `app-server`. A preparação não envia prompts. [Medições e limites da otimização](docs/response-latency.md).

---

## 🚀 Como Executar

### Pré-requisitos
- **Node.js 18+**
- **Antigravity CLI (`agy`)** instalado e autenticado no sistema (ex: `~/.local/bin/agy`)
- PipeWire / PulseAudio (padrão em distribuições Linux para loopback)
- Python 3 com `SpeechRecognition`, `ffmpeg` e `parec` (normalmente fornecido por `pulseaudio-utils`)

### Instalação e Inicialização

```bash
# 1. Instalar as dependências
npm install

# 2. Iniciar o aplicativo desktop
npm start
```

> **Dica**: `npm run dev` também inicia o aplicativo desktop com recarregamento a quente (HMR).

Se o backend já estiver rodando na porta 3001, a inicialização reaproveita esse processo. Se a porta 5173 estiver ocupada, o Vite escolhe outra porta e o Electron abre o endereço correto. Ao fechar o aplicativo, os processos iniciados por ele são encerrados.

---

## 🛠️ Estrutura do Projeto

```
happy-hawking/
├── electron/
│   ├── main.cjs                  # Processo principal do Electron (janela, atalhos, permissões)
│   └── preload.cjs               # ContextBridge seguro expondo perssuaDesktop
├── server/
│   ├── index.js                  # Servidor local Express + WebSocket (porta 3001)
│   ├── agent-bridge.js           # Bridge de execução do Antigravity CLI (`agy`)
│   ├── gemini-copilot.js         # Orquestrador do copiloto Gemini em tempo real
│   ├── system-audio-engine.js    # Captura loopback de áudio do Linux (parec / pw-record)
│   ├── transcriber.js            # Engine de transcrição de áudio
│   └── transcribe.py             # Script auxiliar de transcrição
├── src/
│   ├── main.jsx                  # Entry point do React
│   ├── App.jsx                   # Container principal do desktop widget
│   ├── components/
│   │   ├── CompactHeader.jsx     # Notch superior com controles de janela e modelo
│   │   ├── CompactTabs.jsx       # Abas (Transcrição / Sessão / Resumo)
│   │   ├── CompactTranscriptFeed.jsx # Feed de transcrição com respostas e blocos de código
│   │   ├── CompactAudioMeters.jsx# Medidores de nível (Você / PC Call / Agente)
│   │   ├── CompactBottomBar.jsx  # Barra inferior com microfone, botão Diga isso e drawer
│   │   ├── ModelSelectorModal.jsx# Modal de configuração de modelos e raciocínio
│   │   └── CodeBlock.jsx         # Renderização de código com syntax highlighting
│   ├── hooks/
│   │   ├── useVoiceCopilot.js    # Captura de microfone e transcrição
│   │   ├── useAgentSocket.js     # Comunicação WebSocket e controle de áudio do PC
│   │   └── useAgentSettings.js   # Gerenciamento de preferências do modelo
│   ├── config/
│   │   └── models.js             # Definições de modelos e configurações
│   └── index.css                 # Estilos Tailwind e animações
├── package.json
└── vite.config.js
```

---

## 💡 Como Usar o Copiloto

Antes de uma entrevista, abra **Meu contexto** pelo ícone de pessoa na barra inferior. Escolha **Carregar contexto.md** para ler o arquivo na raiz do projeto, ou **Criar do zero** para escrever um novo texto. Revise e clique em **Salvar contexto** para aplicar; cancelar mantém o contexto anterior e não modifica o arquivo. Se editar o arquivo depois, carregue novamente. Arquivos vazios ou acima de 6.000 caracteres mostram um aviso sem apagar seu rascunho. Salve sua experiência, projetos, vaga e preferências reais. O texto fica salvo neste dispositivo e acompanha os pedidos do copiloto ao modelo selecionado, inclusive após reiniciar a sessão. Para remover o contexto dos próximos pedidos, apague o campo e salve; conversas anteriores não são apagadas. Sem fatos pessoais disponíveis, o prompt orienta a não inventar uma trajetória nem pedir esses dados ao entrevistador.

1. Inicie o aplicativo com `npm start`.
2. O aplicativo abrirá em uma janela compacta no canto direito da tela, fixada no topo.
3. Fale no microfone (clique no ícone ou segure <kbd>ESPAÇO</kbd>) ou deixe a captura de áudio do PC ativa durante uma reunião.
4. Para obter uma resposta da IA instantaneamente para a última fala ou pergunta ouvida, use o atalho <kbd>Alt+Space</kbd> ou clique em **"Diga isso"**.
5. Para esconder a janela durante o compartilhamento de tela, aperte <kbd>Ctrl+B</kbd>.
