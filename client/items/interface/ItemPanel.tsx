import type { Item, VerdictValue } from '@shared/contract.ts';
import { ITEM_STATUS, itemStatus, itemTitle } from '@client/common/domain/selectors.ts';
import { Verdict } from './Verdict.tsx';
import { KIND_VIEWS } from '@client/items/interface/kinds';
import { CLASS, classes } from '@client/common/interface/ui/classes.ts';
import { StatusBadge } from '@client/common/interface/ui/parts.tsx';

/** An item can be edited until it has a verdict. */
const EDITABLE = new Set<string>([ITEM_STATUS.ready, ITEM_STATUS.questions]);

interface ItemPanelProps {
  item: Item;
  /** Not connected, or the run is no longer open: nothing can be sent. */
  busy: boolean;
  /** Claude is working on something sent from this item. */
  working: boolean;
  onEdit: (path: string, text: string) => void;
  onVerdict: (value: VerdictValue, rev: number) => void;
}

/** The item as it will be created, with its verdict. */
export function ItemPanel(props: ItemPanelProps) {
  const { item } = props;
  const View = KIND_VIEWS[item.kind];
  const status = itemStatus(item);
  const panelClass = classes(
    'panel preview',
    status === ITEM_STATUS.questions && CLASS.pending,
    props.working && CLASS.working,
  );
  return (
    <article class={panelClass}>
      <div class="cardtitle">
        <div class="titlerow">
          <h2>{itemTitle(item)}</h2>
          <StatusBadge status={status} />
        </div>
      </div>
      <View item={item} editable={!props.busy && EDITABLE.has(status)} onEdit={props.onEdit} />
      <Verdict item={item} disabled={props.busy} onVerdict={props.onVerdict} />
    </article>
  );
}

interface ItemNavProps {
  items: Item[];
  itemIndex: number;
  onGo: (itemIndex: number) => void;
}

/** The Previous / Next bar under the stage. */
export function ItemNav(props: ItemNavProps) {
  const { items, itemIndex } = props;
  if (items.length < 2) {
    return null;
  }
  const isFirst = itemIndex === 0;
  const isLast = itemIndex === items.length - 1;
  return (
    <nav class="bar" aria-label="Previous and next item">
      <div class="in">
        <button disabled={isFirst} onClick={() => props.onGo(itemIndex - 1)}>
          ← Previous
        </button>
        <span class="meta">{itemTitle(items[itemIndex]!)}</span>
        <button class="primary" disabled={isLast} onClick={() => props.onGo(itemIndex + 1)}>
          Next →
        </button>
      </div>
    </nav>
  );
}
