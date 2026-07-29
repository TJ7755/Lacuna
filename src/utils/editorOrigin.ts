/**
 * Router `location.state` shape used by CardEditor and SequenceEditor to send
 * their "Back"/breadcrumb link to the surface the user actually navigated
 * from, when that differs from what the route itself would otherwise imply
 * (e.g. editing a lesson-owned card opened from the Question bank, or editing
 * a sequence — which has no lesson-scoped edit route — opened from a lesson).
 *
 * Deliberately additive: callers that don't need an override simply omit it,
 * and both editors fall back to their existing route-derived back target
 * (course bank, or the lesson encoded in the URL) when `state` is absent —
 * including after a hard refresh, which always drops router state.
 */
export interface EditorOrigin {
  /** Path the back-link/breadcrumb should point to. */
  path: string;
  /** Label shown in the breadcrumb for that destination. */
  label: string;
}

export interface EditorOriginState {
  origin?: EditorOrigin;
}
