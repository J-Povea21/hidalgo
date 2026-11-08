# Testing Hidalgo

How the tests are organised, how a test should read, and how robust it has to be.
The rules here are the ones a reviewer applies; `pnpm run check` enforces what a
machine can.

## The five kinds of test, and what each is for

| Kind            | Where                                | Runs in                              | Use it for                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**        | `<module>/__tests__/unit/`           | `pnpm test` (vitest)                 | A rule in `common/domain/` or `shared/`, a use case built by `useCases(fakes)` over in-memory fakes (through its mapper when the test is about what the tool returns: `delivered(cases)`, `ItemMapper.toAsked(…)`), a pure client function (reducer, selector). |
| **Component**   | `<module>/__tests__/unit/*.test.tsx` | `pnpm test` (vitest + happy-dom)     | One component's behaviour from the outside: what it renders for a given item, what it calls back with.                                                                                                                                                          |
| **Integration** | `<module>/__tests__/integration/`    | `pnpm test`                          | An adapter against the real thing it wraps: the event log and the live index on a temporary folder.                                                                                                                                                             |
| **End to end**  | `test/e2e.test.ts`                   | `pnpm test`                          | The real server over MCP and real HTTP, without a browser: tokens, origins, exactly-once delivery, crash and resume.                                                                                                                                            |
| **Browser**     | `browser/*.spec.ts`                  | `pnpm run test:browser` (Playwright) | What only a browser shows: the page against the real bundled server, connection states, keyboard use, accessibility, layout, the Content-Security-Policy.                                                                                                       |

Pick the cheapest kind that can prove the behaviour. A rule about verdicts is a unit
test, not a browser test. A browser test that only checks a string a selector builds
is in the wrong place.

`pnpm run check` runs every unit, component, integration and end-to-end test, and the pre-push hook
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
- **Every test follows Arrange–Act–Assert.** Three blocks, in that order, separated by
  a blank line: set up what the test needs, do the one thing under test, check what it
  did. No `// arrange` comments; the blank lines are the structure. A browser story
  that walks through several steps repeats act-then-assert for each step, still with a
  blank line between them:

  ```ts
  it('the real server, on a newer build, makes the page stale', async () => {
    new SomethingOnThePort({ answering: 'the real server', build: 'newer' });

    const identity = await proveServer(SESSION);

    expect(identity).toBe(IDENTITY.stale);
  });
  ```

- **Constants, not magic values.** A timeout, a size or a delay a test depends on gets a
  name that says why it is that value (`PAST_ACTIVE_WINDOW_MS`, `LONG_EDGE`).
- **Comments explain why, never what.** If a line needs a comment to say what it does,
  rename something instead.

### Tests read as stories

Where a test plays out a scene, its helpers are named for who acts in it, so the test
reads as what happens:

- **Browser tests** (`browser/support/`, imported through `browser/support/index.ts`):
  - `claude`, a Claude session driving a real server. `claude.opensRun()` returns the run,
    and what Claude does with it is on the run, one method per Hidalgo tool:
    `run.waitForTheUser()`, `run.say()`, `run.revise()`, `run.pause()`, `run.resume()`
    (`claude/run.ts`). `claude.ends()`, `crashes()` and `restarts()` act on the server
    itself (`claude/session.ts`).
  - `user`, the user in the page, with one part per part of the page, mirroring the
    client's features: `user.questions.pick('Here')`, `user.verdict.approve()`,
    `user.thread.write()`, `user.status.banner('This run is paused')`,
    `user.drawers.openRun()` (`user/*.ts`).
- **The page's connection tests** (`client/common/__tests__/unit/{server,identity,live-feed}.test.ts`) use `SomethingOnThePort`
  (`test/something-on-the-port.ts`): whatever answers on the page's port, played as
  `'the real server'`, `'an impostor relaying the real proof'` or `'a stranger'`.

```ts
test('the answers reach Claude, and then Approve unlocks', async ({ claude, user }) => {
  const run = await claude.opensRun({ cards: [cardAsking('First?')] });
  await user.opens(run);

  const answers = run.waitForTheUser();
  await user.questions.pick('Here');
  await user.questions.send(1);

  expect(await answers).toEqual([expect.objectContaining({ type: 'answers' })]);
  await expect(user.verdict.approveButton).toBeEnabled();
});
```

**Adding to the support code.** A new Hidalgo tool is a new method on `OpenRun`. A new
part of the page is a new file in `browser/support/user/`, added to `UserInPage`. A spec
never reaches for raw selectors that a part could name; if it needs one, the part gets it.
Timings, screens and colours live in `browser/support/constants.ts`, derived from the
product's own constants where there are some. Find elements by role and accessible name
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
- **Every page is guarded.** `browser/support/fixtures.ts` fails any browser test whose page
  throws or breaks its Content-Security-Policy, whatever the test checks.
- **Accessibility is tested, not assumed.** Each state the page can be in is scanned
  with axe in light and dark (`browser/accessibility.spec.ts`), and every action has a
  keyboard-only test.

## Where the helpers live

| File                            | What it holds                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `test/fixtures.ts`              | Valid card and question data, an id counter, `until()`.                                                                               |
| `test/builders.ts`              | `anItem`, `aRun`, `anOpenQuestion`, `approvedAt`… for unit and component tests.                                                       |
| `test/fakes.ts`                 | In-memory fakes of every port, `world()`, `seededWorld()`, `useCases(fakes)`, and `delivered`/`waited` (events as Claude reads them). |
| `test/something-on-the-port.ts` | Whatever answers on the page's port, for the page's connection tests.                                                                 |
| `test/tool-result.ts`           | A tool result from the MCP client, checked with zod.                                                                                  |
| `browser/support/index.ts`      | The one import for specs: `from './support'`.                                                                                         |
| `browser/support/types.ts`      | What the tests pass around, and the typings for what they leave on `window`.                                                          |
| `browser/support/claude/`       | The Claude session (`session.ts`) and an open run with its tools (`run.ts`).                                                          |
| `browser/support/user/`         | The page object, one file per part of the page.                                                                                       |
| `browser/support/fixtures.ts`   | The fixtures and the page guard.                                                                                                      |
| `browser/support/constants.ts`  | Timings, screens, colours and accessibility rules.                                                                                    |
| `browser/support/data.ts`       | Cards, questions and diagrams for browser tests.                                                                                      |
