/**
 * Approve, reject, or leave pending. Approve is blocked while questions are
 * open, and always names the revision on screen: if the item changes, the
 * server refuses the old revision and the user approves the new one. An item
 * left pending can still be approved or rejected later.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Item, VerdictValue } from '@shared/contract.ts';
import { ITEM_STATUS, VERDICT } from '@shared/values.ts';
import { itemStatus, openQuestions } from '@client/common/domain/selectors.ts';
import { StatusBadge, time } from '@client/common/interface/ui/parts.tsx';

interface VerdictProps {
  item: Item;
  disabled: boolean;
  onVerdict: (value: VerdictValue, rev: number) => void;
}

export function Verdict(props: VerdictProps) {
  const { item } = props;
  const status = itemStatus(item);
  const outcome = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(status);
  useEffect(() => {
    // The buttons unmount once a verdict lands: focus moves to the outcome instead of being lost to the page.
    const verdictJustLanded = previousStatus.current !== status;
    const focusWasLost = document.activeElement === document.body;
    if (verdictJustLanded && focusWasLost) {
      outcome.current?.focus();
    }
    previousStatus.current = status;
  }, [status]);

  const decide = (value: VerdictValue) => () => props.onVerdict(value, item.rev);
  const approval = approvalOf(item);
  const approve = (
    <button
      class="good"
      disabled={approval.blocked || props.disabled}
      aria-describedby={approval.blocked ? approval.reasonId : undefined}
      onClick={decide(VERDICT.approved)}
    >
      Approve
    </button>
  );
  const reject = (
    <button disabled={props.disabled} onClick={decide(VERDICT.rejected)}>
      Reject
    </button>
  );

  let content: ComponentChildren;
  switch (status) {
    case ITEM_STATUS.done:
      content = (
        <>
          <StatusBadge status={ITEM_STATUS.done}>Done</StatusBadge>
          <span class="meta">{item.done!.note}</span>
        </>
      );
      break;
    case ITEM_STATUS.approved:
      content = (
        <>
          <StatusBadge status={ITEM_STATUS.approved}>Approved · rev {item.rev}</StatusBadge>
          <span class="meta">Claude acts on it next.</span>
        </>
      );
      break;
    case ITEM_STATUS.rejected:
      content = (
        <>
          <StatusBadge status={ITEM_STATUS.rejected} />
          <span class="meta">at {time(item.verdict!.at)}</span>
        </>
      );
      break;
    case ITEM_STATUS.pending:
      content = (
        <>
          <StatusBadge status={ITEM_STATUS.pending} />
          {approve}
          {reject}
          {approval.note}
        </>
      );
      break;
    case ITEM_STATUS.ready:
    case ITEM_STATUS.questions:
      content = (
        <>
          {approve}
          {reject}
          <button class="ghost" disabled={props.disabled} onClick={decide(VERDICT.pending)}>
            Leave pending
          </button>
          {approval.note}
        </>
      );
      break;
  }
  return (
    <div class="section verdict" tabIndex={-1} ref={outcome}>
      {content}
    </div>
  );
}

interface Approval {
  /** Approve is blocked while questions are open. */
  blocked: boolean;
  /** The id of the note saying why, for the button's aria-describedby. */
  reasonId: string;
  /** What Approve would approve, or why it can't yet. */
  note: ComponentChildren;
}

function approvalOf(item: Item): Approval {
  const openCount = openQuestions(item).length;
  const blocked = openCount > 0;
  const reasonId = `blocked-${item.id}`;
  let note: ComponentChildren;
  if (blocked) {
    note = (
      <span class="blocked" id={reasonId}>
        Answer the {openCount} open question{openCount > 1 ? 's' : ''} first
      </span>
    );
  } else {
    note = <span class="meta">Approves exactly rev {item.rev}.</span>;
  }
  return { blocked, reasonId, note };
}
