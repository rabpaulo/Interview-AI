# Perssua Code Copilot 🎙️⚡

> Clone do [Perssua](https://perssua.com/pt) adaptado para agentes de código autônomos (**Google Antigravity / DeepMind Gemini**).

O **Perssua Code** permite que você converse com o seu agente de programação por voz em tempo real: ele captura sua fala, exibe uma waveform animada com medidores de decibéis, transcreve com latência mínima e despacha os comandos diretamente para o **Antigravity CLI (`agy`)**, exibindo as respostas, códigos e execuções na tela instantaneamente.

---

## ✨ Funcionalidades

- 🌊 **Waveform e Medidores Estilo Perssua**:
  - Visualizador de espectro sonoro com barras dinâmicas sincronizadas ao microfone via **Web Audio API**.
  - Medidores duplos de áudio: canal **VOCÊ** (nível de captação) e canal **AGENTE** (processamento do Antigravity).
  - Timer de gravação ao vivo (`00:15`) com indicador pulsante de status (*Escutando...* / *Processando...*).

- 🎙️ **Reconhecimento de Voz em Tempo Real**:
  - Reconhecimento contínuo e streaming de transcrição em **Português (`pt-BR`)** e **Inglês (`en-US`)**.
  - **Push-to-Talk**: Segure a barra de espaço (<kbd>ESPAÇO</kbd>) para falar rapidamente e solte para despachar o comando.
  - Detecção inteligente de pausa e despacho automático.

- 🤖 **Integração Nativa com o Antigravity (`agy`)**:
  - Comunica-se diretamente com o CLI instalado (`~/.local/bin/agy`).
  - Suporte a streaming de tokens em tempo real (**NDJSON** / `stream-json`).
  - Mantém o contexto de conversa ativo do projeto (`--continue`).
  - Acompanhamento de ações de ferramentas (*tool calls*, leitura e escrita de arquivos).

- 🪟 **Modo HUD Flutuante vs. Dashboard**:
  - **Dashboard Completo**: Visão completa com feed de transcrição ("Você falou" / "Agente respondeu"), abas de sessão e código.
  - **Modo HUD Flutuante**: Widget compacto tipo *Dynamic Island* para posicionar no canto da tela enquanto você coda no VS Code ou terminal.

- 💻 **Visualizador de Código com Formatação e Cópia**:
  - Realce de sintaxe em blocos markdown com botão de cópia com um clique e identificação de linguagem.

---

## 🚀 Como Executar

### 1. Pré-requisitos
- Node.js 18+ (testado no Node.js v26)
- Antigravity CLI (`agy`) configurado no seu sistema

### 2. Instalação e Execução
Na raiz do projeto:

```bash
# Instalar dependências (caso não tenha instalado)
npm install

# Iniciar servidor backend + cliente frontend em conjunto
npm run dev
```

Acesse no navegador:
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API & WebSocket**: `http://localhost:3001` (ws://localhost:3001)

---

## 🛠️ Estrutura do Projeto

```
happy-hawking/
├── server/
│   ├── index.js              # Servidor Express + WebSocket
│   ├── agent-bridge.js       # Bridge que executa o `agy` em modo stream-json
│   └── test-client.js        # Script de teste do pipeline WebSocket
├── src/
│   ├── main.jsx              # Entry point do React
│   ├── App.jsx               # Componente central e orquestrador
│   ├── components/
│   │   ├── Navbar.jsx        # Barra superior com branding e modo HUD
│   │   ├── HeroWaveform.jsx  # Hero com waveform animada e microfone central
│   │   ├── AudioMeters.jsx   # Medidores "VOCÊ" e "AGENTE"
│   │   ├── TranscriptFeed.jsx# Feed de transcrição ("Você falou" / "Diga isso")
│   │   ├── FloatingHud.jsx   # Widget flutuante compacto
│   │   ├── CodeBlock.jsx     # Renderizador de código com cópia
│   │   └── AudioControls.jsx # Sugestões rápidas e input de texto
│   └── hooks/
│       ├── useAudioEngine.js       # Web Audio API (analyser, decibéis, barras)
│       ├── useSpeechRecognition.js # Web Speech API (pt-BR, push-to-talk)
│       └── useAgentSocket.js       # Cliente WebSocket com streaming do agy
└── vite.config.js
```

---

## 💡 Como Usar

1. Abra a aplicação no Chrome, Edge ou navegador compatível com Web Speech API.
2. Conceda a permissão de microfone quando solicitada.
3. Clique no botão de microfone central ou segure **`ESPAÇO`**.
4. Fale um comando em voz alta, como:
   - *"Liste os arquivos desse projeto"*
   - *"Crie uma função em Python para calcular números primos"*
   - *"Explique como funciona a arquitetura do servidor"*
5. Observe a transcrição em tempo real na tela e a resposta imediata gerada pelo Antigravity Code Agent.
