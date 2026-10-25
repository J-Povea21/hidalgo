/** Which run this tab is for, and its token: both come from the address fragment, which never reaches a server. */
export interface Session {
  runId: string;
  token: string;
}

export function sessionFromLocation(hash = location.hash): Session | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const runId = params.get('run');
  const token = params.get('t');
  if (!runId || !token) {
    return undefined;
  }
  return { runId, token };
}
