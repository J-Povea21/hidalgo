import { homedir } from 'node:os';
import { join } from 'node:path';

const PLUGIN_DATA_FOLDER = 'hidalgo';
const HOME_DATA_FOLDER = '.hidalgo';

/**
 * Where Hidalgo keeps its data: inside the plugin's data folder when a Claude Code
 * plugin starts it, otherwise in the user's home.
 */
export function dataRoot(): string {
  const pluginData = process.env['CLAUDE_PLUGIN_DATA'];
  if (pluginData === undefined) {
    return join(homedir(), HOME_DATA_FOLDER);
  }
  return join(pluginData, PLUGIN_DATA_FOLDER);
}
