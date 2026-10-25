import type { ItemKind, ItemOf } from '@shared/contract.ts';

/** What every kind's view gets: an item of exactly its kind, so its fields are typed. */
export interface KindViewProps<K extends ItemKind> {
  item: ItemOf<K>;
  editable: boolean;
  onEdit: (path: string, text: string) => void;
}
