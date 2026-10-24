// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item, Question } from '../../../shared/contract.ts';
import { Questions } from './Questions.tsx';

afterEach(() => { cleanup(); localStorage.clear(); });
const q = (id: string, text: string): Question => ({
  id, text, evidence: [{ kind: 'verified', text: 'seen in the code' }],
  options: [{ label: 'Separately', detail: 'one file' }, { label: 'Here', detail: 'all at once' }], recommended: 0,
});
const item = (questions: Question[]): Item => ({ id: 'i1', kind: 'card', rev: 1, fields: {}, questions, threadId: 't' });

describe('Questions', () => {
  it('marks the recommendation and moves to the next question after a pick', async () => {
    render(<Questions runId="r1" item={item([q('q1', 'First?'), q('q2', 'Second?')])} disabled={false} onSend={async () => true} />);
    expect(screen.getByText('RECOMMENDED')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Here/));
    await waitFor(() => expect(screen.getByText('Second?')).toBeTruthy());
  });

  it('sends the chosen answers with their notes', async () => {
    const onSend = vi.fn(async () => true);
    render(<Questions runId="r1" item={item([q('q1', 'Only?')])} disabled={false} onSend={onSend} />);
    fireEvent.click(screen.getByLabelText(/Separately/));
    fireEvent.input(screen.getByLabelText('Note for Claude (optional)'), { target: { value: 'keep it small' } });
    fireEvent.click(screen.getByRole('button', { name: /Send 1 answer/ }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ q1: { choice: 0, note: 'keep it small' } }));
  });

  it('keeps unsent picks across a reload', () => {
    const { unmount } = render(<Questions runId="r1" item={item([q('q1', 'Only?')])} disabled={false} onSend={async () => true} />);
    fireEvent.click(screen.getByLabelText(/Here/));
    unmount();
    render(<Questions runId="r1" item={item([q('q1', 'Only?')])} disabled={false} onSend={async () => true} />);
    expect((screen.getByLabelText(/Here/) as HTMLInputElement).checked).toBe(true);
  });

  it('shows the rulings once every question is answered', () => {
    const answered = { ...q('q1', 'Done?'), answer: { choice: 1, at: '', note: 'agreed' } };
    render(<Questions runId="r1" item={item([answered])} disabled={false} onSend={async () => true} />);
    expect(screen.getByText('Nothing left to decide on this item')).toBeTruthy();
    expect(screen.getByText('Here')).toBeTruthy();
  });
});
