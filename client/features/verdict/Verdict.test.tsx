// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '@shared/contract.ts';
import { card } from '@test/fixtures.ts';
import { Verdict } from './Verdict.tsx';

afterEach(cleanup);
const item = (over: Partial<Item> = {}): Item => ({ id: 'i1', kind: 'card', rev: 3, fields: card(), questions: [], threadId: 't', ...over });
const openQ = { id: 'q1', text: 'x', evidence: [], options: [{ label: 'a', detail: '' }, { label: 'b', detail: '' }], recommended: 0 };

describe('Verdict', () => {
  it('blocks Approve while a question is open, and says why', () => {
    render(<Verdict item={item({ questions: [openQ] })} disabled={false} onVerdict={() => {}} />);
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Answer the 1 open question first')).toBeTruthy();
  });

  it('sends the revision on screen with the verdict', () => {
    const onVerdict = vi.fn();
    render(<Verdict item={item()} disabled={false} onVerdict={onVerdict} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onVerdict).toHaveBeenCalledWith('approved', 3);
    expect(screen.getByText('Approves exactly rev 3.')).toBeTruthy();
  });

  it('a verdict on an older revision does not count: the buttons come back', () => {
    render(<Verdict item={item({ verdict: { value: 'approved', rev: 2, at: '' } })} disabled={false} onVerdict={() => {}} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
  });

  it('an item left pending can still be approved or rejected', () => {
    const onVerdict = vi.fn();
    render(<Verdict item={item({ verdict: { value: 'pending', rev: 3, at: '' } })} disabled={false} onVerdict={onVerdict} />);
    expect(screen.getByText('Left pending')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onVerdict).toHaveBeenCalledWith('approved', 3);
    expect(screen.queryByRole('button', { name: 'Leave pending' })).toBeNull();
  });

  it('ties the blocked reason to Approve', () => {
    render(<Verdict item={item({ questions: [openQ] })} disabled={false} onVerdict={() => {}} />);
    expect(screen.getByRole('button', { name: 'Approve' }).getAttribute('aria-describedby')).toBe('blocked-i1');
  });

  it('shows a done item with its note, and no buttons', () => {
    render(<Verdict item={item({ verdict: { value: 'approved', rev: 3, at: '' }, done: { at: '', note: 'created 86e3' } })} disabled={false} onVerdict={() => {}} />);
    expect(screen.getByText('created 86e3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
