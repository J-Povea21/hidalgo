/** Where workbench keeps its data: the plugin's data folder when Claude Code provides one. */
import { homedir } from 'node:os';
import { join } from 'node:path';

export const dataRoot = (): string =>
  join(
    process.env['CLAUDE_PLUGIN_DATA'] ?? join(homedir(), '.claude', 'plugins', 'data', 'planeacion-tools'),
    'workbench',
  );
