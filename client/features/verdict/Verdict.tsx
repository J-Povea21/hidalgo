/**
 * Approve, reject, or leave pending. Approve is blocked while questions are
 * open, and always names the revision on screen: if the item changes, the
 * server refuses the old revision and the user approves the new one. An item
 * left pending can still be approved or rejected later.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Item, VerdictValue } from '../../../shared/contract.ts';
import { itemStatus, openQuestions } from '../../core/selectors.ts';
import { StatusBadge, time } from '../../ui/parts.tsx';

export function Verdict(props: { item: Item; disabled: boolean; onVerdict: (value: VerdictValue, rev: number) => void }) {
  const { item } = props;
  const status = itemStatus(item);
  const outcome = useRef<HTMLDivElement>(null);
  const prev = useRef(status);
  // The buttons unmount once a verdict lands: move focus to the outcome so it isn't lost to the page.
  useEffect(() => {
    if (prev.current !== status && document.activeElement === document.body) outcome.current?.focus();
    prev.current = status;
  }, [status]);

  if (status === 'done') return <div class="section verdict" tabIndex={-1} ref={outcome}><StatusBadge status="done">Done</StatusBadge><span class="meta">{item.done!.note}</span></div>;
  if (status === 'approved') return <div class="section verdict" tabIndex={-1} ref={outcome}><StatusBadge status="approved">Approved · rev {item.rev}</StatusBadge><span class="meta">Claude acts on it next.</span></div>;
  if (status === 'rejected') return <div class="section verdict" tabIndex={-1} ref={outcome}><StatusBadge status="rejected" /><span class="meta">at {time(item.verdict!.at)}</span></div>;
  const open = openQuestions(item).length;
  const blockedId = `blocked-${item.id}`;
  const approve = (
    <button class="good" disabled={open > 0 || props.disabled} aria-describedby={open > 0 ? blockedId : undefined}
      onClick={() => props.onVerdict('approved', item.rev)}>Approve</button>
  );
  const reason = open > 0
    ? <span class="blocked" id={blockedId}>Answer the {open} open question{open > 1 ? 's' : ''} first</span>
    : <span class="meta">Approves exactly rev {item.rev}.</span>;
  if (status === 'pending') {
    return (
      <div class="section verdict" tabIndex={-1} ref={outcome}>
        <StatusBadge status="pending" />
        {approve}
        <button disabled={props.disabled} onClick={() => props.onVerdict('rejected', item.rev)}>Reject</button>
        {reason}
      </div>
    );
  }
  return (
    <div class="section verdict" tabIndex={-1} ref={outcome}>
      {approve}
      <button disabled={props.disabled} onClick={() => props.onVerdict('rejected', item.rev)}>Reject</button>
      <button class="ghost" disabled={props.disabled} onClick={() => props.onVerdict('pending', item.rev)}>Leave pending</button>
      {reason}
    </div>
  );
}
