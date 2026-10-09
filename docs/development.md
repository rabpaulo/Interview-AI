# Desenvolvimento

## Ambiente

Use Node.js 22.12 ou superior, npm e Python 3. A captura de áudio do sistema foi implementada para Linux com PipeWire/PulseAudio, usando `pactl` e `parec`. O projeto não oferece um backend equivalente de captura do PC para Windows ou macOS.

Em distribuições Debian/Ubuntu, as dependências de áudio podem ser instaladas com:

```bash
sudo apt install python3 python3-venv ffmpeg pulseaudio-utils
python3 -m venv .venv
source .venv/bin/activate
python -m pip install SpeechRecognition
npm ci
```

Inicie o app no mesmo terminal com o ambiente virtual ativo: o backend procura `python3` no `PATH`. O pacote `PyAudio` não é necessário para este fluxo, pois a captura acontece no Electron ou via `parec`, e o Python recebe arquivos de áudio.

Instale e autentique o CLI do provedor escolhido antes de abrir o app. Para verificar as dependências locais:

```bash
node --version
python3 -c "import speech_recognition; print(speech_recognition.__version__)"
command -v ffmpeg pactl parec
command -v agy codex
```

## Executar e compilar

| Comando | Função |
| --- | --- |
| npm start | Inicia Vite, Electron e o backend local. |
| npm run dev | Mesmo fluxo de npm start, com atualização do frontend pelo Vite. |
| npm run build | Gera os arquivos do frontend em dist/. |
| npm run desktop | Abre o Electron; usa Vite se disponível, senão o frontend servido pelo backend. |
| npm test | Executa os testes offline de áudio, sessões, backend e interface. |

Para abrir o frontend compilado, encerre o Vite antes de executar:

```bash
npm run build
npm run desktop
```

O build não gera um instalador desktop. O Electron continua executando a partir do checkout com suas dependências instaladas.

O Vite começa na porta 5173 e escolhe outra se ela estiver ocupada. O script passa a URL efetiva ao Electron. O backend usa a porta 3001 no fluxo desktop; se já houver um backend respondendo nessa porta, ele será reaproveitado.

Mudanças no backend exigem reiniciar seu processo. Fechar o Electron encerra o backend que ele iniciou, mas não um backend reaproveitado. O Vite ignora alterações de backend, documentação e testes para evitar recargas da captura durante o desenvolvimento.

## Configuração por ambiente

| Variável | Uso |
| --- | --- |
| AGY_BIN | Caminho do executável Antigravity. Defina explicitamente: o fallback atual é um caminho da máquina original do projeto. |
| CODEX_BIN | Caminho do executável Codex; fallback atual: /usr/bin/codex. |
| PORT | Porta ao iniciar server/index.js diretamente; o launcher desktop fixa 3001. |
| PERSSUA_DEV_URL | URL do renderer; preenchida pelo script de desenvolvimento. |
| LATENCY_PROVIDER, LATENCY_MODEL, LATENCY_RUNS | Configuração do script de medição de latência. |

```bash
AGY_BIN="$(command -v agy)" CODEX_BIN="$(command -v codex)" npm start
```

O backend não carrega `.env` automaticamente. Exporte as variáveis no shell ou passe-as no comando. O frontend e o Electron esperam a porta 3001; mudar apenas `PORT` não reconfigura todos os clientes.

## Organização do código

| Caminho | Responsabilidade |
| --- | --- |
| electron/ | Janela desktop, atalhos, permissões e ciclo de vida do backend. |
| scripts/dev.js | Inicialização do Vite e do Electron. |
| src/App.jsx | Composição da interface e sincronização de preferências. |
| src/components/ | Feed, controles, seletores e editor de contexto. |
| src/hooks/ | Estado do áudio, WebSocket e preferências locais. |
| src/audio/ | Captura PCM do microfone via AudioWorklet. |
| shared/streaming-transcription.js | Janelas WAV, sobreposição, fila e consolidação do texto. |
| server/index.js | API HTTP, WebSocket e coordenação da sessão. |
| server/system-audio-engine.js | Captura e detecção de fala do PC. |
| server/pc-transcription.js | Encaminhamento dos trechos do PC ao transcritor. |
| server/transcriber.js e server/transcribe.py | Processo de reconhecimento e limpeza de áudio temporário. |
| server/live-copilot.js | Agendamento de respostas para falas consolidadas. |
| server/gemini-copilot.js | Prompts das personas e despacho para ambos os provedores. |
| server/agent-bridge.js e server/codex-session.js | Processos persistentes dos CLIs. |
| server/candidate-context.js | Leitura limitada ao contexto.md da raiz do projeto. |

`GET /api/candidate-context/file` lê o arquivo fixo do projeto, sem aceitar um caminho do cliente. Retorna o texto ou um erro para o editor. A importação só altera o contexto ativo quando o usuário salva; a sincronização usa `/api/settings` e o evento WebSocket `sync_settings`.

## Verificação

```bash
npm test
npm run build
git diff --check
```

Os testes simulam CLIs, reconhecimento e captura quando necessário; não enviam perguntas a provedores reais. Eles abrem portas locais e criam processos filhos, então o ambiente precisa permitir essas operações. Há testes específicos para leitura de contexto, cancelamento, retomada de fala, fila de respostas e reutilização de sessões.

O script `scripts/measure-response-latency.js` é diferente da suíte offline: chama o provedor autenticado e consome sua cota. Veja [como medir](response-latency.md#medir-o-provedor).

## Arquivos locais

O `.gitignore` exclui `contexto.md`, `.env`, dependências, build, logs, ambientes virtuais, caches Python e relatórios de testes. Exemplos `.env.example` podem ser versionados, mas não são carregados automaticamente.

A configuração HTTP/WebSocket atual é voltada ao uso local e não possui autenticação de aplicação. Não trate esse backend como um serviço pronto para hospedagem pública. O bridge do Antigravity inicia o CLI com `--dangerously-skip-permissions`; considere esse comportamento ao executar mensagens diretas no agente.
