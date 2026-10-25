// Starts the workbench server as a child of this process, sharing its stdio, so the
// server's parent (the "Claude Code" that owns its runs) is this launcher and not the
// test worker. A second session in the same worker needs that, on any OS.
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, process.argv.slice(2), { stdio: 'inherit' });
server.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
