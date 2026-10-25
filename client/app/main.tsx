/** Boots the page from the address fragment: `#run=<id>&t=<token>`. */
import { render } from 'preact';
import { createApi, sessionFromLocation } from '@client/infra/api.ts';
import { App } from './App.tsx';

const root = document.getElementById('app')!;
const session = sessionFromLocation();
if (!session) {
  root.innerHTML = '<div class="empty">This address is missing its run. Open the page from Claude, or ask Claude to reopen it.</div>';
} else {
  render(<App api={createApi(session)} session={session} />, root);
}
