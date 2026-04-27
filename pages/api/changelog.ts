import type { NextApiRequest, NextApiResponse } from 'next';
import { loadChangelog } from '../../lib/changelog';

// GET /api/changelog?limit=N — returns the most recent changelog entries.
// Used by the avatar dropdown's "What's new" section so the client doesn't
// need to bundle fs.

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? '5'), 10) || 5));
  const entries = loadChangelog().slice(0, limit);
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  return res.status(200).json({ entries });
}
