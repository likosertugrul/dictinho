/**
 * Words hand-picked for a "practice just these" session.
 *
 * Kept in memory rather than in the route: a selection can run to hundreds of
 * uuids, which would make an unusable (and on web, possibly truncated) URL.
 * A reload therefore loses the selection — the drill screen says so and sends
 * the user back to pick again.
 */
let picked: string[] = [];

export function setPickedWords(ids: string[]) {
  picked = [...ids];
}

export function getPickedWords(): string[] {
  return picked;
}
