import type { NextApiRequest, NextApiResponse } from 'next';
import { csvLine } from '../../../../lib/csvImport';

// Downloadable template for the Households + parents CSV import.

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const header = ['household_name', 'parent_name', 'parent_email', 'parent_phone', 'billing_address', 'preferred_currency'];
  const examples = [
    ['Chen family', 'Wei Chen', 'wei.chen@example.com', '+61 412 345 678', '12 Acacia Ave, Sydney NSW 2000', 'AUD'],
    ['Patel household', 'Priya Patel', 'priya.patel@example.com', '+1 415-555-0182', '500 Market St, San Francisco CA 94105', 'USD'],
    ['O\'Brien family', 'Mary O\'Brien', 'mary@example.co.uk', '07700 900123', 'Flat 4, 22 Kingsway, London WC2B 6LE', 'GBP'],
  ];
  const body = [csvLine(header), ...examples.map(csvLine)].join('\r\n') + '\r\n';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="households-import-template.csv"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(body);
}
