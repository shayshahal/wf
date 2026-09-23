import { execFile } from 'node:child_process';
// Herdr sidebar adapter: present only inside a Herdr pane; pushes the declared step as the pane summary.
export const isHerdrPresent = () => process.env.HERDR_ENV === '1';
export function reportStepToHerdr(state) {
  const summary = `${state.step}${state.waiting_on === 'shay' ? ' ← YOU' : ''}`;
  // execFile has no shell: pass the token value unquoted.
  execFile('herdr', ['pane', 'report-metadata', '--token', `summary=${summary}`], () => {});
}
