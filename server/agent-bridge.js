import { spawn } from 'child_process';
import readline from 'readline';

/**
 * Executes a prompt against Antigravity CLI (`agy`) with streaming NDJSON output.
 * @param {Object} options
 * @param {string} options.prompt - The user's transcribed voice command or text
 * @param {string} [options.conversationId] - Active conversation ID if any
 * @param {string} [options.cwd] - Working directory for the agent (defaults to project dir)
 * @param {Function} options.onMessage - Callback for each stream-json event
 * @param {Function} options.onError - Callback for errors
 * @param {Function} options.onClose - Callback when agent finishes
 * @returns {Object} { kill: Function, pid: number }
 */
export function runAgyAgent({
  prompt,
  conversationId,
  cwd = process.cwd(),
  onMessage,
  onError,
  onClose,
}) {
  const agyBin = process.env.AGY_BIN || '/home/paulo/.local/bin/agy';

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
  ];

  if (conversationId) {
    args.push('--conversation', conversationId);
  } else {
    // Continue recent conversation context or start fresh
    args.push('--continue');
  }

  console.log(`[AGY] Spawning agent: ${agyBin} ${args.slice(0, 3).join(' ')} ... in ${cwd}`);

  let child;
  try {
    child = spawn(agyBin, args, {
      cwd,
      env: {
        ...process.env,
        PAGER: 'cat',
      },
    });
  } catch (err) {
    onError?.(err);
    return { kill: () => {} };
  }

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed);
      onMessage?.(data);
    } catch {
      // Non-JSON line (logs/raw outputs)
      onMessage?.({
        event: 'raw_log',
        text: trimmed,
      });
    }
  });

  child.stderr.on('data', (chunk) => {
    const errText = chunk.toString();
    console.warn(`[AGY stderr]:`, errText);
    onMessage?.({
      event: 'agent_stderr',
      text: errText,
    });
  });

  child.on('error', (err) => {
    console.error(`[AGY process error]:`, err);
    onError?.(err);
  });

  child.on('close', (code) => {
    console.log(`[AGY process closed] exit code: ${code}`);
    onClose?.(code);
  });

  return {
    kill: () => {
      try {
        child.kill('SIGTERM');
      } catch (e) {
        console.error('Error killing agy process:', e);
      }
    },
    pid: child.pid,
  };
}
