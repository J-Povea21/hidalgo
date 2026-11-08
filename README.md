# Hidalgo

A local page where a developer and an AI agent work through a task together: the agent
shows its work, asks its questions, and waits for your verdict.

An agent's work is mostly decisions, and walls of text are a poor way to make them.
Hidalgo turns that work into something to act on:

- The agent's questions come as small choices you select, one at a time.
- Each card or finding has its own conversation, so a discussion stays with the thing it
  is about.
- The work itself takes shape where you can see it: the card being written, a review's
  findings, a diagram of the flow.

You spend your attention on thinking and deciding, not on reading.

Under the page is a local MCP server. The agent drives the page through its tools, and
everything you do there comes back to the agent as events. The rules that matter are
enforced by the server itself:

- Approve stays blocked while a question is open.
- A verdict counts only for the revision on screen.
- A run doesn't close until every item has an outcome.

## Using it with Claude Code

`dist/` is committed, so a checkout runs with only Node 20 or later.

```bash
git clone git@github.com:J-Povea21/hidalgo.git
claude mcp add hidalgo --scope user -- node "$PWD/hidalgo/dist/server.mjs"
```

Then add the Stop hook to `~/.claude/settings.json`. It stops a turn from ending while a
run's page is waiting on an agent that isn't listening:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node /path/to/hidalgo/dist/stop-hook.mjs", "timeout": 5 }]
      }
    ]
  }
}
```

The tools are `open_session`, `add_items`, `ask`, `update_item`, `send_message`,
`create_diagram`, `wait_for_events`, `set_status`, `mark_done`, `list_runs` and
`close_session`. A skill calls `open_session` first, shows its work with `add_items` and
`ask`, calls `wait_for_events` whenever it is the user's turn, and `close_session` at the
end.

Data lives in `~/.hidalgo/`, or in `${CLAUDE_PLUGIN_DATA}/hidalgo/` when a Claude Code
plugin starts the server:

- `runs/<project>/<run id>/` holds each run's state, event log and images;
- `live/` lists the pages open right now.

Closed runs are removed after 7 days; unfinished runs are kept until you decide.

## Developing it

```bash
pnpm install --frozen-lockfile  # also turns on the pre-push check; no dependency runs code
pnpm run check                  # every check: what the pre-push hook runs
pnpm test                       # unit, component and end-to-end tests
pnpm run test:browser           # the page in a real browser; run it before pushing
pnpm run format                 # Prettier
pnpm run build                  # rebuilds dist/; commit it with your change
pnpm run demo                   # the real server with a demo run, in your browser
```

Before changing it, read:

- [`docs/conventions.md`](docs/conventions.md): the architecture, the code style, the
  security rules, and why `dist/` is committed;
- [`docs/testing.md`](docs/testing.md): which kind of test to write, how a test reads,
  and how robust it has to be.
