const JIRA_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

/** Whether an ID can name an issue in a saved tracker-note section. */
export const isTrackerId = (id: string): boolean => JIRA_KEY.test(id);

const KEY_ANYWHERE = /[A-Z][A-Z0-9]*-\d+/i;

/**
 * A round with no tracker ticket: its state records no `ids` and neither its id, round nor branch
 * names a key anywhere (`fix/jx-1449`, `fix/JX-1534-gap` count as naming one). It has no tracker
 * note and nothing to post. A branch with a key but no `ids` is not ticketless: that is the #234 case.
 */
export function isTicketless(state: { ids?: readonly string[]; id?: string; round?: string } | null, branch?: string): boolean {
	if (!state || state.ids !== undefined) return false;
	return ![state.id, state.round, branch].some((name) => name !== undefined && KEY_ANYWHERE.test(name));
}

/** Refuse IDs that wf post cannot address; a branch name is not a ticket key. */
export function trackerIdsGap(ids: readonly string[]): string | null {
	const invalid = ids.filter((id) => !isTrackerId(id));
	return !ids.length ? 'no tracker ticket IDs recorded' : invalid.length ? `invalid tracker ticket IDs: ${invalid.join(', ')}` : null;
}
