/** Boots the page from the address fragment, `#run=<id>&t=<token>`: builds the browser's adapters and renders the app over them. */
import { render } from 'preact';
import { BrowserDraftStore } from '@client/common/infrastructure/drafts.ts';
import { HttpHidalgoServer } from '@client/common/infrastructure/server.ts';
import { sessionFromLocation } from '@client/common/infrastructure/session.ts';
import { BrowserImageShrinker } from '@client/conversation/infrastructure/images.ts';
import { App } from './App.tsx';
import { buildModules } from './modules.ts';

const NO_RUN = 'This address is missing its run. Open the page from Claude, or ask Claude to reopen it.';

const root = document.getElementById('app')!;
const session = sessionFromLocation();
if (session) {
  const modules = buildModules({ server: new HttpHidalgoServer(session), shrinker: new BrowserImageShrinker() });
  render(<App modules={modules} drafts={new BrowserDraftStore(session.runId)} session={session} />, root);
} else {
  root.innerHTML = `<div class="empty">${NO_RUN}</div>`;
}
