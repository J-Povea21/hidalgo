/**
 * Approve, reject, or leave pending. Approve is blocked while questions are
 * open, and always names the revision on screen: if the item changes, the
 * server refuses the old revision and the user approves the new one.
 */
import type { Item, VerdictValue } from '../../../shared/contract.ts';
import { itemStatus, openQuestions } from '../../core/selectors.ts';
import { StatusBadge, time } from '../../ui/parts.tsx';

export function Verdict(props: { item: Item; disabled: boolean; onVerdict: (value: VerdictValue, rev: number) => void }) {
  const { item } = props;
  const status = itemStatus(item);
  if (status === 'done') return <div class="section verdict"><StatusBadge status="done">Done</StatusBadge><span class="meta">{item.done!.note}</span></div>;
  if (status === 'approved') return <div class="section verdict"><StatusBadge status="approved">Approved · rev {item.rev}</StatusBadge><span class="meta">Claude acts on it next.</span></div>;
  if (status === 'rejected') return <div class="section verdict"><StatusBadge status="rejected" /><span class="meta">at {time(item.verdict!.at)}</span></div>;
  if (status === 'pending') return <div class="section verdict"><StatusBadge status="pending" /><button class="link" onClick={() => props.onVerdict('rejected', item.rev)}>Reject instead</button></div>;
  const open = openQuestions(item).length;
  return (
    <div class="section verdict">
      <button class="good" disabled={open > 0 || props.disabled} onClick={() => props.onVerdict('approved', item.rev)}>Approve</button>
      <button disabled={props.disabled} onClick={() => props.onVerdict('rejected', item.rev)}>Reject</button>
      <button class="ghost" disabled={props.disabled} onClick={() => props.onVerdict('pending', item.rev)}>Leave pending</button>
      {open > 0
        ? <span class="blocked">Answer the {open} open question{open > 1 ? 's' : ''} first</span>
        : <span class="meta">Approves exactly rev {item.rev}.</span>}
    </div>
  );
}
