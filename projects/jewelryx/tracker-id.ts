const JIRA_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

/** Whether an ID can name an issue in a saved tracker-note section. */
export const isTrackerId = (id: string): boolean => JIRA_KEY.test(id);

/** Refuse IDs that wf post cannot address; a branch name is not a ticket key. */
export function trackerIdsGap(ids: readonly string[]): string | null {
	const invalid = ids.filter((id) => !isTrackerId(id));
	return !ids.length ? 'no tracker ticket IDs recorded' : invalid.length ? `invalid tracker ticket IDs: ${invalid.join(', ')}` : null;
}
