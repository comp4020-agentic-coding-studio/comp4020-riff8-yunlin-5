// Nothing a player types is rendered today: seats are shown by glyph and
// fighter id, both from server-side tables. This stays as the guard for any
// text that ever reaches a template string: escape it first, always.
export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
