# Testing workbench

How the tests are organised, how a test should read, and how robust it has to be.
The rules here are the ones a reviewer applies; `pnpm run check` enforces what a
machine can.

## The four kinds of test, and what each is for

| Kind           | Where                               | Runs in                              | Use it for                                                                                                                                                |
| -------------- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**       | next to the code, `*.test.ts`       | `pnpm test` (vitest)                 | A rule in `server/kernel/` or `shared/`, a slice's use case with in-memory fakes, a pure client function (reducer, selector).                             |
| **Component**  | next to the component, `*.test.tsx` | `pnpm test` (vitest + happy-dom)     | One component's behaviour from the outside: what it renders for a given item, what it calls back with.                                                    |
| **End to end** | `test/e2e.test.ts`                  | `pnpm test`                          | The real server over MCP and real HTTP, without a browser: tokens, origins, exactly-once delivery, crash and resume.                                      |
| **Browser**    | `browser/*.spec.ts`                 | `pnpm run test:browser` (Playwright) | What only a browser shows: the page against the real bundled server, connection states, keyboard use, accessibility, layout, the Content-Security-Policy. |

Pick the cheapest kind that can prove the behaviour. A rule about verdicts is a unit
test, not a browser test. A browser test that only checks a string a selector builds
is in the wrong place.

`pnpm run check` runs every unit, component and end-to-end test, and the pre-push hook
runs `check`. The browser suite is separate and is run before pushing a change to the
page or the server (it needs Chromium: `pnpm exec playwright install chromium`, once).

## How a test reads

A test is read far more often than it is written. When it fails, its name and its body
should say what broke without opening the code.

- **The name is a sentence about behaviour**, in the domain's words:
  `'is ready again when the item changed after it was approved'`, not `'itemStatus rev 2'`.
  `describe` names the thing (`"an item's status"`); `it` completes the sentence.
- **One behaviour per test.** Several `expect`s are fine when they check one outcome
  from different sides. Two behaviours are two tests.
- **The data says only what the test is about.** Build it with the builders in
  `test/builders.ts` (`anItem`, `aRun`, `anOpenQuestion`, `approvedAt`…) and override
  only what matters: `anItem({ rev: 2, verdict: approvedAt(1) })`.
- **Arrange, act, assert, in that order**, separated by a blank line when the test is
  longer than a few lines.
- **Constants, not magic values.** A timeout, a size or a delay a test depends on gets a
  name that says why it is that value (`PAST_ACTIVE_WINDOW_MS`, `LONG_EDGE`).
- **Comments explain why, never what.** If a line needs a comment to say what it does,
  rename something instead.

### Browser tests read as a story

Browser tests use two fixtures from `browser/support/test.ts`:

- `claude`: a Claude session driving a real workbench server, through methods named for
  what Claude does: `claude.opensRun()`, `claude.waitsForTheUser(run)`, `claude.says()`,
  `claude.pauses()`, `claude.crashes()`, `claude.restarts()` (`browser/support/claude.ts`);
- `user`: the user in the page, through what a person sees and does: `user.opens(run)`,
  `user.picks('Here')`, `user.approves()`, `user.banner('This run is paused')`
  (`browser/support/user.ts`).

```ts
test('the answers reach Claude, and then Approve unlocks', async ({ claude, user }) => {
  const run = await claude.opensRun({ cards: [cardAsking('First?')] });
  await user.opens(run);

  const answers = claude.waitsForTheUser(run);
  await user.picks('Here');
  await user.sendsAnswers(1);

  expect(await answers).toEqual([expect.objectContaining({ type: 'answers' })]);
  await expect(user.button('Approve')).toBeEnabled();
});
```

When a test needs something the page object doesn't have, add a method to it rather
than reaching for selectors in the spec. Find elements by role and accessible name
first (`getByRole`, `getByLabel`): that also proves a screen reader can find them. Use
`data-turn`, `data-connection` and `data-testid="toast"` to check state apart from its
wording.

Spec files are named by what the user is doing: `deciding`, `conversations`,
`connection`, `media`, `sessions`, `layout`, `accessibility`.

## How robust a test must be

A test that fails one run in fifty teaches everyone to ignore it. These rules are what
keep the suite trustworthy.

- **Never sleep.** Wait for the condition: `await expect(locator).toBeVisible()` in the
  browser, `until(() => condition)` from `test/fixtures.ts` in vitest. A fixed delay is
  either too short on a busy machine or wasted time on a fast one.
- **When lag is the bug, say how much is too much.** The server's keep-alive is 15 s, so
  a state push that lagged would still pass a 15 s wait. Tests about promptness use an
  explicit short timeout (`PROMPTLY`, 3 s).
- **Time is faked, not waited for.** For backoff, idle and lost states, install the
  Playwright clock (`page.clock.install()`) or vitest's fake timers.
- **Nothing shared between tests.** Each test gets its own data folder, its own server
  and its own page; ports are always chosen by the system (`0`), never hard-coded.
- **Prove the negative explicitly.** "No new tab was opened" is an assertion on the
  count of opened pages, not the absence of an error.
- **A fixed bug comes with the test that would have caught it**, and that test is seen
  failing without the fix before it is trusted.
- **Every page is guarded.** `browser/support/test.ts` fails any browser test whose page
  throws or breaks its Content-Security-Policy, whatever the test checks.
- **Accessibility is tested, not assumed.** Each state the page can be in is scanned
  with axe in light and dark (`browser/accessibility.spec.ts`), and every action has a
  keyboard-only test.

## Where the helpers live

| File                        | What it holds                                                                   |
| --------------------------- | ------------------------------------------------------------------------------- |
| `test/fixtures.ts`          | Valid card and question data, an id counter, `until()`.                         |
| `test/builders.ts`          | `anItem`, `aRun`, `anOpenQuestion`, `approvedAt`… for unit and component tests. |
| `test/fakes.ts`             | In-memory fakes of every port, `world()` and `seededWorld()`.                   |
| `browser/support/claude.ts` | The Claude session that drives a real server.                                   |
| `browser/support/user.ts`   | The page object: what the user sees and does.                                   |
| `browser/support/data.ts`   | Cards, questions and diagrams for browser tests.                                |
| `browser/support/test.ts`   | The fixtures and the page guard.                                                |
