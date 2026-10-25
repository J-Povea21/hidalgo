import { describe, expect, it } from 'vitest';
import { aRun } from '@test/builders.ts';
import {
  actions,
  CONNECTION,
  initialState,
  reduce,
  type PageAction,
  type PageState,
  type Presence,
} from '@client/common/domain/state.ts';

const LISTENING: Presence = { claudeListening: true, claudeActiveAt: 0 };
const NOT_LISTENING: Presence = { claudeListening: false, claudeActiveAt: 0 };

const after = (...steps: PageAction[]): PageState => steps.reduce(reduce, initialState);

describe('the page state', () => {
  it('takes a newer snapshot of the run', () => {
    const state = after(
      actions.state(aRun({ version: 4 }), NOT_LISTENING),
      actions.state(aRun({ version: 5 }), NOT_LISTENING),
    );
    expect(state.run?.version).toBe(5);
  });

  it('never goes back to an older snapshot that arrives late, but still takes its presence', () => {
    const state = after(
      actions.state(aRun({ version: 5 }), NOT_LISTENING),
      actions.state(aRun({ version: 4, subject: 'old' }), LISTENING),
    );
    expect(state.run?.version).toBe(5);
    expect(state.claudeListening).toBe(true);
  });

  it('a keep-alive that changes nothing returns the same state, so nothing re-renders', () => {
    const state = after(actions.state(aRun(), LISTENING));
    expect(reduce(state, actions.presence({ ...LISTENING }))).toBe(state);
  });

  it('a keep-alive that changes presence is taken', () => {
    const state = after(actions.state(aRun(), LISTENING), actions.presence(NOT_LISTENING));
    expect(state.claudeListening).toBe(false);
  });

  it('a goodbye sticks through the reconnect attempts that follow it', () => {
    const state = after(
      actions.connection({ kind: CONNECTION.ended, reason: 'bye' }),
      actions.connection({ kind: CONNECTION.reconnecting, since: 0 }),
    );
    expect(state.connection.kind).toBe(CONNECTION.ended);
  });

  it('a goodbye is lifted once the connection is live again', () => {
    const state = after(
      actions.connection({ kind: CONNECTION.ended, reason: 'bye' }),
      actions.connection({ kind: CONNECTION.live }),
    );
    expect(state.connection.kind).toBe(CONNECTION.live);
  });
});
