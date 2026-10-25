// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item, Question } from '@shared/contract.ts';
import { anItem, anOpenQuestion } from '@test/builders.ts';
import { BrowserDraftStore } from '@client/common/infrastructure/drafts.ts';
import { Questions } from '@client/items/interface/Questions.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
const question = (id: string, text: string): Question => anOpenQuestion(id, text);
const item = (questions: Question[]): Item => anItem({ questions, threadId: 't' });

describe('Questions', () => {
  it('marks the recommendation and moves to the next question after a pick', async () => {
    render(
      <Questions
        runId="r1"
        drafts={new BrowserDraftStore('r1')}
        item={item([question('q1', 'First?'), question('q2', 'Second?')])}
        disabled={false}
        onSend={async () => true}
      />,
    );
    expect(screen.getByText('RECOMMENDED')).toBeTruthy();
    // A pointer click carries a click count.
    fireEvent.click(screen.getByLabelText(/Here/), { detail: 1 });
    await waitFor(() => expect(screen.getByText('Second?')).toBeTruthy());
  });

  it('arrow keys move between options without moving on; Enter commits and focus follows', async () => {
    render(
      <Questions
        runId="r1"
        drafts={new BrowserDraftStore('r1')}
        item={item([question('q1', 'First?'), question('q2', 'Second?')])}
        disabled={false}
        onSend={async () => true}
      />,
    );
    const here = screen.getByLabelText(/Here/);
    // The click a browser fires for an arrow key has no click count.
    fireEvent.click(here, { detail: 0 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByText('First?')).toBeTruthy();
    fireEvent.keyDown(here, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Second?')).toBeTruthy());
    await waitFor(() => expect(document.activeElement).toHaveProperty('name', 'q2'));
  });

  it('sends the chosen answers with their notes', async () => {
    const onSend = vi.fn(async () => true);
    render(
      <Questions
        runId="r1"
        drafts={new BrowserDraftStore('r1')}
        item={item([question('q1', 'Only?')])}
        disabled={false}
        onSend={onSend}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Separately/));
    fireEvent.input(screen.getByLabelText('Note for Claude (optional)'), { target: { value: 'keep it small' } });
    fireEvent.click(screen.getByRole('button', { name: /Send 1 answer/ }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ q1: { choice: 0, note: 'keep it small' } }));
  });

  it('keeps unsent picks across a reload', () => {
    const { unmount } = render(
      <Questions
        runId="r1"
        drafts={new BrowserDraftStore('r1')}
        item={item([question('q1', 'Only?')])}
        disabled={false}
        onSend={async () => true}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Here/));
    unmount();
    render(
      <Questions
        runId="r1"
        drafts={new BrowserDraftStore('r1')}
        item={item([question('q1', 'Only?')])}
        disabled={false}
        onSend={async () => true}
      />,
    );
    expect(screen.getByLabelText(/Here/)).toHaveProperty('checked', true);
  });

  it('shows the rulings once every question is answered', () => {
    const answered = { ...question('q1', 'Done?'), answer: { choice: 1, at: '', note: 'agreed' } };
    render(
      <Questions
        runId="r1"
        drafts={new BrowserDraftStore('r1')}
        item={item([answered])}
        disabled={false}
        onSend={async () => true}
      />,
    );
    expect(screen.getByText('Nothing left to decide on this item')).toBeTruthy();
    expect(screen.getByText('Here')).toBeTruthy();
  });
});
