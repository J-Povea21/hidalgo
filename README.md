# workbench

The local MCP server and page every planeacion-tools skill uses to work with
you in the browser instead of the chat: questions as a carousel, a
conversation per item, images, diagrams, and Approve / Reject per item.

The approved design, with every decision behind it, is
[`docs/workbench/design.md`](../../docs/workbench/design.md). Read it before
changing the contract or the tools.

## Using it

Nothing to install. The plugin declares the server in `.mcp.json` and Claude
Code starts it with the session; `dist/` is committed, so it runs straight
from the plugin with only Node.

Data lives in `${CLAUDE_PLUGIN_DATA}/workbench/`: `runs/<project>/<run id>/`
(state, event log, images) and `live/` (pages open right now). Closed runs are
removed after 7 days; unfinished runs are kept until the user decides.

## Developing it

```bash
cd servers/workbench
npm ci              # scripts stay off (.npmrc): no dependency runs code at install
npm run check       # everything below, the same checks the pre-push hook runs
npm test            # vitest: kernel, slices, end to end over real HTTP + MCP
npm run build       # rebuilds dist/; commit it with your change
npm run demo        # the real server with a demo run, opened in your browser
```

The first `npm run build`, `test` or `check` also points git at
`.githooks/pre-push`, which runs `npm run check` before any push that touches
this folder. It can't happen on `npm install` because install scripts are off.
There is no CI yet, so this hook is the gate, and `git push --no-verify` skips it.

## Layout

| Folder | Holds | May import |
|---|---|---|
| `shared/` | the contract: schemas and types both halves use | nothing of ours |
| `server/kernel/` | the rules every item kind obeys, as pure functions | `shared/` |
| `server/features/<slice>/` | one use case per folder, with its tests | `kernel/`, `shared/` |
| `server/infra/` | disk, HTTP, MCP, processes; wires the slices | anything on the server |
| `client/core/` | the page's state, pure | `shared/` types |
| `client/features/<slice>/` | one part of the page each | `core/`, `ui/`, `infra/` |
| `client/kinds/<kind>/` | the view for one item kind | `core/`, `ui/` |
| `client/app/` | wires the page together | anything on the client |

These are enforced by `.dependency-cruiser.cjs`, not by convention.

## Adding a kind of item (pr-review findings, review-queue pull requests)

1. A schema in `shared/contract.ts`, added to `ItemKinds`.
2. A view in `client/kinds/<kind>/`, added to `client/kinds/index.ts`.
3. Any new actions as their own slices in `server/features/`.

The tools stay the same.
