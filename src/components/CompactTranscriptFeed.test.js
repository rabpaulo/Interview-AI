import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

// Exercise the component's real effects and event handlers with a measured feed.
const source = fs.readFileSync(new URL('./CompactTranscriptFeed.jsx', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export function CompactTranscriptFeed', 'function CompactTranscriptFeed');
const { code } = await transformWithEsbuild(source, 'CompactTranscriptFeed.jsx', { jsx: 'transform' });

function createFeedHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let dirty = false;
  let top = 0;
  let writes = 0;
  const feed = {
    clientHeight: 300,
    scrollHeight: 1800,
    get scrollTop() { return top; },
    set scrollTop(value) {
      top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight));
      writes++;
    },
  };
  function effect(callback, dependencies) {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      slots[index] = dependencies;
      effects.push(callback);
    }
  }
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: 'fragment' },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) dirty = true;
        slots[index] = next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect: effect,
    useLayoutEffect: effect,
    Date, setTimeout,
    navigator: { clipboard: { writeText() {} } },
    ...Object.fromEntries(['Sparkles', 'Mic', 'Copy', 'Check', 'StopCircle', 'Clock', 'Terminal', 'Bot', 'Monitor', 'Send', 'FileText', 'RotateCw', 'Cpu', 'ArrowDown', 'FormattedAgentResponse'].map((name) => [name, name])),
  });
  vm.runInContext(code, context);
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap((item) => nodes(item));
    if (!value || typeof value !== 'object') return [];
    return [value, ...nodes(value.children || [])];
  }
  function render(props) {
    context.props = {
      activeTab: 'transcription', messages: [], pcLiveTranscripts: [], ...props,
    };
    do {
      dirty = false;
      cursor = 0;
      effects = [];
      tree = vm.runInContext('CompactTranscriptFeed(props)', context);
      for (const node of nodes(tree)) {
        if (node.props.ref) {
          node.props.ref.current = node.props.className?.includes('app-transcript-feed')
            ? feed
            : { scrollIntoView() { feed.scrollTop = feed.scrollHeight; } };
        }
      }
      effects.forEach((callback) => callback());
    } while (dirty);
  }
  return {
    feed, render,
    writes: () => writes,
    scrollTo(value) {
      top = value;
      nodes(tree).find((node) => node.props.className?.includes('app-transcript-feed'))
        .props.onScroll?.({ currentTarget: feed });
    },
    liveButton: () => nodes(tree).find((node) => node.type === 'button' && node.props['aria-label'] === 'Voltar ao vivo'),
  };
}

const messages = [{ id: 'pc-a', role: 'interlocutor', text: 'Como resolvemos isso?' }];

test('new speech and streamed answers preserve the position while reading history', () => {
  const app = createFeedHarness();
  app.render({ messages });
  app.scrollTo(450);
  const writes = app.writes();
  app.feed.scrollHeight += 200;
  app.render({ messages: [...messages, { id: 'reply-a', role: 'copilot', text: 'Podemos começar' }], interimTranscript: 'Outra fala', pcLiveTranscripts: [{ utteranceId: 'b', text: 'Texto novo' }], isProcessing: true });
  assert.equal(app.feed.scrollTop, 450, 'updates must not pull the reader to the bottom');
  assert.equal(app.writes(), writes, 'no programmatic scrolling while reading');
  assert.ok(app.liveButton(), 'the reader can explicitly resume following');
});

test('following the live feed stays at the bottom and can resume after reading', () => {
  const app = createFeedHarness();
  app.render({ messages });
  assert.equal(app.feed.scrollTop, 1500);
  app.feed.scrollHeight += 200;
  const next = [...messages, { id: 'reply-a', role: 'copilot', text: 'Resposta' }];
  app.render({ messages: next });
  assert.equal(app.feed.scrollTop, 1700);
  app.scrollTo(450);
  app.render({ messages: next });
  app.liveButton().props.onClick();
  assert.equal(app.feed.scrollTop, 1700);
  app.feed.scrollHeight += 100;
  app.render({ messages: [...next, { id: 'pc-b', role: 'interlocutor', text: 'Próxima pergunta' }] });
  assert.equal(app.feed.scrollTop, 1800);
  assert.equal(app.liveButton(), undefined);
});

test('scrolling back to the bottom resumes following automatically', () => {
  const app = createFeedHarness();
  app.render({ messages });
  app.scrollTo(450);
  app.scrollTo(1500);
  app.feed.scrollHeight += 100;
  app.render({ messages: [...messages] });
  assert.equal(app.feed.scrollTop, 1600);
  assert.equal(app.liveButton(), undefined);
});

test('a new session and a tab change restore live following', () => {
  const app = createFeedHarness();
  app.render({ messages });
  app.scrollTo(450);
  app.render({ messages: [], pcLiveTranscripts: [] });
  app.render({ messages });
  assert.equal(app.feed.scrollTop, 1500);
  app.scrollTo(450);
  app.render({ activeTab: 'session', messages });
  assert.equal(app.feed.scrollTop, 1500);
  assert.equal(app.liveButton(), undefined);
});
