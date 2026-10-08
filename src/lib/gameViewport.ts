/** New game moments must be visible below the pinned score bar. Restored outcomes
 * never call this helper, so opening a saved game does not replay a reward. */
export function revealGameMoment(element: HTMLElement | null): void {
  if (!element) return;
  element.focus({preventScroll: true});
  element.scrollIntoView({block: 'start', behavior: 'instant'});
  const hud = document.querySelector<HTMLElement>('.gameplay-hud');
  const pinned = hud && getComputedStyle(hud).position === 'sticky';
  const top = pinned ? hud.getBoundingClientRect().bottom + 20 : 20;
  window.scrollBy({top: element.getBoundingClientRect().top - top, behavior: 'instant'});
}
