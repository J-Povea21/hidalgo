/** The item as it will be created, with its verdict; and the Previous / Next bar under the stage. */
import type { Item, VerdictValue } from '@shared/contract.ts';
import { itemStatus, itemTitle } from '@client/core/selectors.ts';
import { Verdict } from '@client/features/verdict/Verdict.tsx';
import { KIND_VIEWS } from '@client/kinds/index.ts';
import { StatusBadge } from '@client/ui/parts.tsx';

export function ItemPanel(props: {
  item: Item;
  busy: boolean;
  working: boolean;
  onEdit: (path: string, text: string) => void;
  onVerdict: (value: VerdictValue, rev: number) => void;
}) {
  const { item } = props;
  const View = KIND_VIEWS[item.kind];
  const status = itemStatus(item);
  return (
    <article class={`panel preview ${status === 'questions' ? 'pending' : ''} ${props.working ? 'working' : ''}`}>
      <div class="cardtitle">
        <div class="titlerow">
          <h2>{itemTitle(item)}</h2>
          <StatusBadge status={status} />
        </div>
      </div>
      <View item={item} editable={!props.busy && (status === 'ready' || status === 'questions')} onEdit={props.onEdit} />
      <Verdict item={item} disabled={props.busy} onVerdict={props.onVerdict} />
    </article>
  );
}

export function ItemNav(props: { items: Item[]; index: number; onGo: (i: number) => void }) {
  const { items, index } = props;
  if (items.length < 2) return null;
  return (
    <nav class="bar" aria-label="Previous and next item">
      <div class="in">
        <button disabled={index === 0} onClick={() => props.onGo(index - 1)}>← Previous</button>
        <span class="meta">{itemTitle(items[index]!)}</span>
        <button class="primary" disabled={index === items.length - 1} onClick={() => props.onGo(index + 1)}>Next →</button>
      </div>
    </nav>
  );
}
