# workbench

The interactive page where a developer and Claude work through a skill together.

A skill's work is mostly decisions, and walls of text are a poor way to make them.
Workbench turns that work into something to act on:

- Claude's questions come as small choices you select, one at a time.
- Each card or finding has its own conversation, so a discussion stays with the thing it
  is about.
- The work itself takes shape where you can see it: the card being written, a review's
  findings, a diagram of the flow.

You spend your attention on thinking and deciding, not on reading.

Under the page is a local MCP server, shipped inside this plugin. Claude drives the page
through its tools, and everything you do there comes back to Claude as events. The rules
that matter are enforced by the server itself:

- Approve stays blocked while a question is open.
- A verdict counts only for the revision on screen.
- A run doesn't close until every item has an outcome.

## Using it

Nothing to install. The plugin declares the server in `.claude-plugin/plugin.json`
(`mcpServers`), and Claude Code starts it with the session. `dist/` is committed, so it runs straight from the plugin with only
Node.

Data lives in `${CLAUDE_PLUGIN_DATA}/workbench/`:

- `runs/<project>/<run id>/` holds each run's state, event log and images;
- `live/` lists the pages open right now.

Closed runs are removed after 7 days; unfinished runs are kept until you decide.

## Developing it

```bash
cd servers/workbench
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
