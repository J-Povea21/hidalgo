/** Boots the page from the address fragment: `#run=<id>&t=<token>`. */
import { render } from 'preact';
import { HttpWorkbenchServer } from '@client/common/infrastructure/server.ts';
import { sessionFromLocation } from '@client/common/infrastructure/session.ts';
import { App } from './App.tsx';
import { buildModules } from './modules.ts';

const NO_RUN = 'This address is missing its run. Open the page from Claude, or ask Claude to reopen it.';

const root = document.getElementById('app')!;
const session = sessionFromLocation();
if (session) {
  render(<App modules={buildModules(new HttpWorkbenchServer(session))} session={session} />, root);
} else {
  root.innerHTML = `<div class="empty">${NO_RUN}</div>`;
}
