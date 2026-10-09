# Interview AI

Copiloto desktop para entrevistas e reuniões, com transcrição de áudio e sugestões de resposta em uma janela flutuante. A interface ainda usa o nome **Perssua**.

- Captura do áudio do PC no Linux e gravação pelo microfone.
- Transcrição durante a fala; respostas automáticas após sua consolidação.
- Sugestões em tom profissional e conversacional, com contexto pessoal editável.
- Integração com os CLIs autenticados do Antigravity e do Codex.

## Requisitos

- Linux com PipeWire/PulseAudio para capturar o áudio do PC.
- Node.js **22.12+** e npm.
- Python 3 com `SpeechRecognition`, além de `ffmpeg`, `pactl` e `parec` no sistema.
- Pelo menos um dos CLIs (`agy` ou `codex`) instalado e autenticado.
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
```

Selecione o provedor correspondente no cabeçalho. `npm start` inicia o frontend, abre o Electron e inicia ou reaproveita o backend na porta 3001. O áudio do PC tenta iniciar automaticamente.

Para instalar as dependências de áudio e entender os modos de execução, consulte o [guia de desenvolvimento](docs/development.md).

## Usar

1. Escolha o modelo e o tipo de entrevista no cabeçalho.
2. Abra **Meu contexto**, no ícone de pessoa da barra inferior. Use **Carregar contexto.md** ou **Criar do zero**, revise o texto e salve.
3. Confira a captura nos medidores de áudio. No modo automático, as falas consolidadas do PC geram sugestões; use **Diga isso** para solicitar uma manualmente.
4. Para enviar uma mensagem de voz ao agente, use o microfone ou segure **Espaço** com o app em foco.

O `contexto.md` é local e está no `.gitignore`; não acompanha o clone. Importar o arquivo cria uma cópia editável no app. Alterações posteriores no arquivo exigem carregá-lo novamente.

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
chmod +x "release/Perssua AI Copilot-1.0.0.AppImage"
./release/Perssua\ AI\ Copilot-1.0.0.AppImage
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
