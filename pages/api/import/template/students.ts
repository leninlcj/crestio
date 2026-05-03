import type { NextApiRequest, NextApiResponse } from 'next';
import { csvLine } from '../../../../lib/csvImport';

// Downloadable template for the Students CSV import. Header row + 3 example
// rows showing the conventions we expect: free-text year level, comma-
// separated subjects, dollar-denominated rates, and the household_name
// column that auto-creates households on the fly.

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const header = ['name', 'household_name', 'subjects', 'year_level', 'pay_rate_dollars', 'notes'];
  const examples = [
    ['Ava Chen', 'Chen family', 'Maths, Physics', 'Year 11', '85', 'Prefers Tuesday afternoons'],
    ['Noah Patel', 'Patel household', 'English', 'Grade 9', '70', ''],
    ['Liam O\'Brien', '', 'Chemistry, Biology', 'HSC Y12', '95', 'Wants help with practice exam papers'],
  ];
  const body = [csvLine(header), ...examples.map(csvLine)].join('\r\n') + '\r\n';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students-import-template.csv"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(body);
}
