/**
 * "Ask about this": select text on the item and a button offers to quote it into
 * the item's conversation. Works for a mouse selection and a keyboard one
 * (Shift+arrows); the button sits just above the selection.
 */
import { useEffect, useState } from 'preact/hooks';

const BUTTON_HALF_WIDTH = 55;
const BUTTON_LIFT = 40;

export function AskAbout(props: { within: string; onQuote: (text: string) => void }) {
  const [ask, setAsk] = useState<{ x: number; y: number; text: string }>();

  useEffect(() => {
    const check = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('.askbtn')) return;
      const sel = getSelection();
      const text = sel?.toString().trim();
      const inside = sel?.anchorNode?.parentElement?.closest(props.within);
      if (!text || !inside || !sel?.rangeCount) return setAsk(undefined);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setAsk({ x: r.left + scrollX + r.width / 2 - BUTTON_HALF_WIDTH, y: r.top + scrollY - BUTTON_LIFT, text });
    };
    addEventListener('mouseup', check);
    addEventListener('keyup', check);
    return () => { removeEventListener('mouseup', check); removeEventListener('keyup', check); };
  }, [props.within]);

  if (!ask) return null;
  return (
    <button class="askbtn" style={{ left: `${ask.x}px`, top: `${ask.y}px` }} onClick={() => {
      props.onQuote(ask.text);
      setAsk(undefined);
      getSelection()?.removeAllRanges();
    }}>Ask about this</button>
  );
}
