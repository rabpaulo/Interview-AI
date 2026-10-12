# InterviewAI

Copiloto desktop para entrevistas e reuniões, com transcrição de áudio e sugestões de resposta em uma janela flutuante.

- Captura do áudio do PC no Linux e gravação pelo microfone.
- Transcrição durante a fala; respostas automáticas após sua consolidação.
- Sugestões em tom profissional e conversacional, com contexto pessoal editável.
- Integração com os CLIs autenticados do Antigravity, do Codex e do Claude Code.

<p align="center">
  <img src="docs/screenshots/transcricao.png" width="400" alt="Transcrição do áudio do PC com sugestões de resposta do copiloto">
</p>

| Meu contexto | Menu | Modelo de IA |
| :---: | :---: | :---: |
| <img src="docs/screenshots/meu-contexto.png" width="260" alt="Editor de contexto pessoal"> | <img src="docs/screenshots/menu.png" width="260" alt="Menu com modelo, modo, idioma e nova sessão"> | <img src="docs/screenshots/modelo.png" width="260" alt="Seleção de provedor e modelo"> |

<sub>Capturas com dados fictícios de demonstração.</sub>

## Requisitos

- Linux com PipeWire/PulseAudio para capturar o áudio do PC.
- Node.js **22.12+** e npm.
- Python 3 com `SpeechRecognition`, além de `ffmpeg`, `pactl` e `parec` no sistema.
- Pelo menos um dos CLIs (`agy`, `codex` ou `claude`) instalado e autenticado.
- Internet para o reconhecimento de voz e as respostas do provedor.

## Executar

```bash
git clone git@github.com:rabpaulo/Interview-AI.git
cd Interview-AI
npm ci
```

Informe o caminho do CLI que vai utilizar e inicie o app:

```bash
# Antigravity
AGY_BIN="$(command -v agy)" npm start

# Ou Codex
CODEX_BIN="$(command -v codex)" npm start

# Ou Claude Code
CLAUDE_BIN="$(command -v claude)" npm start
```

Selecione o provedor correspondente em **Menu → Modelo**, no ícone ☰ da barra inferior. `npm start` inicia o frontend, abre o Electron e inicia ou reaproveita o backend na porta 3001. O áudio do PC tenta iniciar automaticamente.

Para instalar as dependências de áudio e entender os modos de execução, consulte o [guia de desenvolvimento](docs/development.md).

## Usar

1. No menu (☰) da barra inferior, escolha o modelo e o modo (tipo de entrevista).
2. Abra **Meu contexto**, no ícone de pessoa da barra inferior. Preencha perfil (incluindo a linguagem preferida), experiências e vaga, e salve. O perfil fica em `~/.local/share/interviewai/profile.json` e persiste entre execuções.
3. Confira a captura nos medidores de áudio. No modo automático, as falas consolidadas do PC geram sugestões; use **Diga isso** em uma fala da transcrição ou Ctrl+D para solicitar uma manualmente.
4. Para enviar uma mensagem de voz ao agente, use o microfone ou segure **Espaço** com o app em foco.

O `contexto.md` é local e está no `.gitignore`; não acompanha o clone. Em **Extras**, importar o arquivo acrescenta o texto às notas do perfil.

O fim da fala é detectado por uma pausa de aproximadamente 900 ms. Isso pode dividir uma pergunta com pausas longas. A latência também depende da transcrição e do modelo; não há garantia de resposta instantânea.

## Gerar AppImage

Para gerar o pacote executável portátil `.AppImage` (Linux x64):

```bash
npm run build:appimage
# ou execute o script auxiliar:
./scripts/build-appimage.sh
```

O arquivo executável será gerado no diretório `release/`:

```bash
chmod +x "release/InterviewAI-1.0.0.AppImage"
./release/InterviewAI-1.0.0.AppImage
```

## Documentação

- [Uso, contexto pessoal e atalhos](docs/usage.md)
- [Instalação, arquitetura e testes](docs/development.md)
- [Fluxo de áudio e diagnóstico de latência](docs/response-latency.md)

```bash
npm test
npm run build
```

Os testes usam serviços simulados. O uso normal envia áudio ao serviço de reconhecimento e texto ao provedor selecionado; as respostas seguem os limites da conta autenticada.
