import { useEffect } from 'preact/hooks';
import type { TurnView } from '@client/common/domain/selectors.ts';

/** The favicon dot's colour for each turn. The browser tests read these too. */
export const TURN_COLOR: Record<TurnView, string> = {
  yours: '#c27c0e',
  working: '#2f5bd3',
  idle: '#9b9a94',
  done: '#1f7a4d',
  offline: '#9b9a94',
};

const ICON_SIZE_PX = 32;
const DOT_RADIUS_PX = 12;

/** The browser tab: a title that leads with whose turn it is, and a dot of the same state's colour. */
export function useTab(title: string, turn: TurnView): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(() => {
    const dot = drawDot(TURN_COLOR[turn]);
    if (dot) {
      faviconLink().href = dot;
    }
  }, [turn]);
}

/** A filled circle in `color`, as a data URL; undefined if the browser can't draw. */
function drawDot(color: string): string | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_SIZE_PX;
  const drawing = canvas.getContext('2d');
  if (!drawing) {
    return undefined;
  }
  const centre = ICON_SIZE_PX / 2;
  drawing.fillStyle = color;
  drawing.beginPath();
  drawing.arc(centre, centre, DOT_RADIUS_PX, 0, Math.PI * 2);
  drawing.fill();
  return canvas.toDataURL();
}

/** The page's icon link, created the first time. */
function faviconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>('link[rel=icon]');
  if (existing) {
    return existing;
  }
  const link = document.createElement('link');
  link.rel = 'icon';
  document.head.appendChild(link);
  return link;
}
