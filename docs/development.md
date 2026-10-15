# Desenvolvimento

## Ambiente

Use Node.js 22.12 ou superior, npm e Python 3. A captura de áudio do PC funciona no Linux (PipeWire/PulseAudio, com `pactl` e `parec`) e no Windows 10/11 (loopback do sistema capturado pelo Electron). macOS não é suportado.

### Linux

Em distribuições Debian/Ubuntu, as dependências de áudio podem ser instaladas com:

```bash
sudo apt install python3 python3-venv ffmpeg pulseaudio-utils
python3 -m venv .venv
source .venv/bin/activate
python -m pip install SpeechRecognition
npm ci
```

Inicie o app no mesmo terminal com o ambiente virtual ativo: o backend procura `python3` no `PATH`. O pacote `PyAudio` não é necessário para este fluxo, pois a captura acontece no Electron ou via `parec`, e o Python recebe arquivos de áudio.

### Windows

Instale o [Node.js](https://nodejs.org/) 22.12+ e o [Python 3](https://www.python.org/downloads/windows/) (marque “Add python.exe to PATH”). No PowerShell, na pasta do projeto:

```powershell
py -m pip install SpeechRecognition
npm ci
npm start
```

O `ffmpeg` é opcional no Windows: o app envia ao reconhecimento áudio WAV já em 16 kHz, e o `ffmpeg` só é usado para outros formatos. O backend procura o Python como `PYTHON_BIN`, `python`, `py -3` ou `python3`, ignorando o atalho da Microsoft Store.

No Windows, o backend não acessa o dispositivo de áudio: quando a captura do PC é ligada, a janela pede ao Electron o áudio do desktop (`chromeMediaSource: 'desktop'`), reduz para PCM 16 kHz mono num AudioWorklet e envia pacotes binários de 50 ms pelo WebSocket. O backend aplica a mesma detecção de fala e transcrição do Linux. Para testar esse caminho em outro sistema, defina `INTERVIEWAI_AUDIO_SOURCE=renderer` (o Electron só fornece o loopback no Windows).

Os CLIs instalados pelo npm no Windows são atalhos `.cmd`; o app os encontra pelo `PATH` (com `PATHEXT`) e os executa por meio do `cross-spawn`. Ao fechar, o Electron encerra a árvore de processos do backend com `taskkill`, incluindo os CLIs.

### Verificar

Instale e autentique o CLI do provedor escolhido antes de abrir o app. Para verificar as dependências locais:

```bash
node --version
python3 -c "import speech_recognition; print(speech_recognition.__version__)"
command -v ffmpeg pactl parec
command -v agy codex claude
```

## Executar e compilar

| Comando | Função |
| --- | --- |
| npm start | Inicia Vite, Electron e o backend local. |
| npm run dev | Mesmo fluxo de npm start, com atualização do frontend pelo Vite. |
| npm run build | Gera os arquivos do frontend em dist/. |
| npm run build:appimage | Compila o frontend e empacota o executável AppImage em release/. |
| npm run build:win | Compila o frontend e gera o instalador NSIS e o executável portátil do Windows (x64) em release/. |
| npm run pack | Empacota os binários do Electron descompactados em release/linux-unpacked. |
| npm run desktop | Abre o Electron; usa Vite se disponível, senão o frontend servido pelo backend. |
| npm test | Executa os testes offline de áudio, sessões, backend e interface. |

Para gerar e testar o AppImage independente:

```bash
npm run build:appimage
# ou:
./scripts/build-appimage.sh
```

Para o Windows, execute `npm run build:win` numa máquina Windows. Ele gera `release/InterviewAI-1.0.0-setup.exe` (instalador, permite escolher a pasta) e `release/InterviewAI-1.0.0-portable.exe` (sem instalação). No Linux, `npx electron-builder --win portable --x64` também gera o portátil; o instalador NSIS precisa do Wine com suporte a 32 bits para montar o desinstalador.

Os pacotes não incluem o Python nem os CLIs: instale-os na máquina de destino como descrito acima. O app não é assinado digitalmente, então o Windows SmartScreen pode pedir confirmação na primeira execução.

O AppImage gerado em `release/` inclui o frontend compilado, o backend Express/WebSocket e as dependências de produção para execução sem precisar do servidor de desenvolvimento ativo.

O Vite começa na porta 5173 e escolhe outra se ela estiver ocupada. O script passa a URL efetiva ao Electron. O backend usa a porta 3001 no fluxo desktop; se já houver um backend respondendo nessa porta, ele será reaproveitado.

Mudanças no backend exigem reiniciar seu processo. Fechar o Electron encerra o backend que ele iniciou, mas não um backend reaproveitado. O Vite ignora alterações de backend, documentação e testes para evitar recargas da captura durante o desenvolvimento.

## Configuração por ambiente

| Variável | Uso |
| --- | --- |
| AGY_BIN | Caminho do executável Antigravity. Sem ela, o app procura `agy` no `PATH` e em `~/.local/bin`. |
| CODEX_BIN | Caminho do executável Codex. Sem ela, procura `codex` no `PATH`, em `/usr/bin` e, no Windows, em `%APPDATA%\npm`. |
| CLAUDE_BIN | Caminho do executável Claude Code. Sem ela, procura `claude` no `PATH`, em `~/.local/bin` e em `/usr/bin`. |
| PYTHON_BIN | Interpretador Python usado pelo transcritor; sem ela, `python3`/`python` (Linux) ou `python`/`py -3` (Windows). |
| INTERVIEWAI_AUDIO_SOURCE | `parec` (padrão no Linux) ou `renderer` (padrão no Windows): origem do áudio do PC. |
| PORT | Porta ao iniciar server/index.js diretamente; o launcher desktop fixa 3001. |
| INTERVIEWAI_DEV_URL | URL do renderer; preenchida pelo script de desenvolvimento. |
| LATENCY_PROVIDER, LATENCY_MODEL, LATENCY_RUNS | Configuração do script de medição de latência. |

```bash
AGY_BIN="$(command -v agy)" CODEX_BIN="$(command -v codex)" npm start
```

```powershell
$env:CLAUDE_BIN = (Get-Command claude).Source; npm start
```

O backend não carrega `.env` automaticamente. Exporte as variáveis no shell ou passe-as no comando. O frontend e o Electron esperam a porta 3001; mudar apenas `PORT` não reconfigura todos os clientes.

## Organização do código

| Caminho | Responsabilidade |
| --- | --- |
| electron/ | Janela desktop, atalhos globais (Ctrl+Alt), captura de tela por monitor, permissões e ciclo de vida do backend. |
| scripts/dev.js | Inicialização do Vite e do Electron. |
| src/App.jsx | Composição da interface e sincronização de preferências. |
| src/components/ | Feed, controles, seletores e editor de contexto. |
| src/hooks/ | Estado do áudio, WebSocket e preferências locais, incluindo o zoom do texto (`useTextZoom`, salvo no `localStorage`). |
| src/audio/ | Captura PCM do microfone via AudioWorklet. |
| shared/streaming-transcription.js | Janelas WAV, sobreposição, fila e consolidação do texto. |
| server/index.js | API HTTP, WebSocket e coordenação da sessão. |
| server/system-audio-engine.js | Captura (parec no Linux, PCM recebido da janela no Windows) e detecção de fala do PC. |
| src/audio/system-loopback.js | Captura do loopback do sistema na janela do Electron (Windows) e envio do PCM pelo WebSocket. |
| server/cli-process.js | Localização dos CLIs e do Python (PATH/PATHEXT), execução de atalhos `.cmd` e encerramento da árvore de processos no Windows. |
| server/document-import.js | Extração de texto de PDF (`unpdf`), DOCX (`mammoth`), TXT e MD, prompt de organização e validação dos campos do currículo ou da vaga. |
| src/components/DocumentDropZone.jsx | Área de arrastar ou escolher arquivo das abas Perfil e Vaga. |
| server/pc-transcription.js | Encaminhamento dos trechos do PC ao transcritor. |
| server/transcriber.js e server/transcribe.py | Processo de reconhecimento e limpeza de áudio temporário. |
| server/live-copilot.js | Agendamento de respostas para falas consolidadas. |
| server/gemini-copilot.js | Prompts das personas e despacho para ambos os provedores. |
| server/agent-bridge.js, server/codex-session.js e server/claude-session.js | Processos persistentes dos CLIs. |
| server/agent-images.js | Validação das imagens anexadas (até 4, base64 PNG/JPEG/WebP) e formato de cada CLI: inline no Codex e no Claude Code; arquivo temporário no Antigravity. |
| server/candidate-context.js | Leitura limitada ao contexto.md da raiz do projeto. |
| server/conversation-memory.js | Janela de falas reais, separada de sugestões da IA, enviada a cada pedido do copiloto. |
| shared/candidate-profile.js | Perfil estruturado: normalização, limites e montagem do texto enviado ao modelo. |
| server/profile-store.js | Persistência do perfil em `~/.local/share/interviewai/profile.json` ou `%APPDATA%\InterviewAI\profile.json` (gravação atômica). |

`POST /api/profile/import?kind=cv|job` recebe o arquivo no corpo (até 10 MB, nome no cabeçalho `X-File-Name`), organiza o texto com `runIsolatedAgent` (um processo do CLI só para esse pedido, sem afetar a sessão aquecida nem a conversa) e devolve `{ fields, warning? }`; nada é gravado até o usuário salvar. `GET /api/profile` e `PUT /api/profile` leem e gravam o perfil; o backend o carrega na inicialização e é a única fonte do contexto. `INTERVIEWAI_PROFILE_PATH` troca o arquivo (os testes usam um temporário). `GET /api/candidate-context/file` lê o `contexto.md` fixo do projeto, sem aceitar um caminho do cliente; a importação só altera o perfil quando o usuário salva.

## Verificação

```bash
npm test
npm run build
git diff --check
```

Os testes simulam CLIs, reconhecimento e captura quando necessário; não enviam perguntas a provedores reais. Há testes para o envio de imagens aos CLIs (`agent-bridge.test.js`, `agent-images.test.js`), para o zoom do texto (`useTextZoom.test.js`), para a importação de currículo e vaga (`document-import.test.js`, com um PDF gerado no teste), para execuções isoladas dos três CLIs, para a busca de CLIs no `PATH` do Windows (`cli-process.test.js`) e para o áudio recebido da janela (`system-audio-engine.test.js`). Eles abrem portas locais e criam processos filhos, então o ambiente precisa permitir essas operações. Há testes específicos para leitura de contexto, cancelamento, retomada de fala, fila de respostas e reutilização de sessões.

Os testes de sessão verificam que perguntas de continuidade recebem as falas anteriores, as mensagens do usuário e suas correções pelos dois provedores. Também verificam a limpeza em nova sessão, a ausência de sugestões geradas entre os fatos e a preservação de falas captadas no modo manual. Isso valida os dados enviados, não a qualidade semântica de um modelo real.

Para revisar respostas reais em seis cenários fictícios (técnico, hipótese, experiência conhecida, experiência ausente, continuidade e dado pessoal ausente), execute `npm run eval:copilot`. Esse comando usa a cota do provedor autenticado; não faz parte de `npm test`. Configure `EVAL_PROVIDER`, `EVAL_MODEL` e, opcionalmente, `EVAL_CASE`. O relatório JSON contém o texto das respostas para revisão humana. Verifique se a explicação é concreta, se hipóteses estão identificadas, se experiências e resultados foram preservados e se dados pessoais não foram inventados.

O script `scripts/measure-response-latency.js` é diferente da suíte offline: chama o provedor autenticado e consome sua cota. Veja [como medir](response-latency.md#medir-o-provedor).

## Arquivos locais

O `.gitignore` exclui `contexto.md`, `.env`, dependências, build, logs, ambientes virtuais, caches Python e relatórios de testes. Exemplos `.env.example` podem ser versionados, mas não são carregados automaticamente.

A configuração HTTP/WebSocket atual é voltada ao uso local e não possui autenticação de aplicação. Não trate esse backend como um serviço pronto para hospedagem pública. O bridge do Antigravity inicia o CLI com `--dangerously-skip-permissions`; considere esse comportamento ao executar mensagens diretas no agente.
