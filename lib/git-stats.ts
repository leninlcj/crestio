// Build-time git inspection. Used by getStaticProps to surface honest signals
// like "N commits in the last 7 days" on the homepage.
//
// On Vercel, the build container has the cloned repo available — git history
// depth depends on the project's Vercel settings. If git is unreachable or
// returns 0, callers should hide the badge rather than render an embarrassing
// zero.

import { execSync } from 'node:child_process';

export function getCommitsInLastDays(days: number = 7): number {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const out = execSync(`git log --since="${since}" --oneline`, {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}
