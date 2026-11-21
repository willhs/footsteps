/** `?tour=1` turns the guided tour on (lib/tour.ts). Its own module so the page can check the flag without loading the tour. */
export function tourParam(search: string): boolean {
  return new URLSearchParams(search).get('tour') === '1';
}
