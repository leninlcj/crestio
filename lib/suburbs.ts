// Suburbs with their own landing page (/tutoring/[slug]). Facts only:
// region, neighbouring suburbs and, where the suburb has its own station,
// the line it sits on. Nothing here claims a tutor lives in the suburb.
//
// Regions are the everyday names families use, not council boundaries,
// because several suburbs straddle two councils.

export type Region = 'St George' | 'Sutherland Shire' | 'South-west Sydney';

export type Suburb = {
  slug: string;
  name: string;
  region: Region;
  neighbours: string[];           // slugs of suburbs in this list
  station?: { line: 'T4 Illawarra' | 'T8 Airport and South' } | null;
  core?: boolean;                 // inside the founder's home area
};

export const SUBURBS: readonly Suburb[] = [
  // St George
  { slug: 'hurstville', name: 'Hurstville', region: 'St George', neighbours: ['allawah', 'penshurst', 'beverly-hills', 'south-hurstville', 'kingsgrove', 'bexley'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'kogarah', name: 'Kogarah', region: 'St George', neighbours: ['carlton', 'allawah', 'rockdale', 'sans-souci', 'blakehurst', 'bexley'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'rockdale', name: 'Rockdale', region: 'St George', neighbours: ['kogarah', 'bexley', 'arncliffe', 'brighton-le-sands'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'beverly-hills', name: 'Beverly Hills', region: 'St George', neighbours: ['hurstville', 'kingsgrove', 'narwee', 'penshurst', 'peakhurst'], station: { line: 'T8 Airport and South' }, core: true },
  { slug: 'penshurst', name: 'Penshurst', region: 'St George', neighbours: ['hurstville', 'mortdale', 'beverly-hills', 'peakhurst'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'mortdale', name: 'Mortdale', region: 'St George', neighbours: ['penshurst', 'oatley', 'peakhurst', 'lugarno'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'oatley', name: 'Oatley', region: 'St George', neighbours: ['mortdale', 'lugarno', 'penshurst', 'como'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'peakhurst', name: 'Peakhurst', region: 'St George', neighbours: ['mortdale', 'riverwood', 'lugarno', 'beverly-hills', 'penshurst'], station: null, core: true },
  { slug: 'riverwood', name: 'Riverwood', region: 'St George', neighbours: ['peakhurst', 'narwee', 'padstow', 'beverly-hills'], station: { line: 'T8 Airport and South' }, core: true },
  { slug: 'bexley', name: 'Bexley', region: 'St George', neighbours: ['rockdale', 'kogarah', 'hurstville', 'kingsgrove', 'arncliffe'], station: null, core: true },
  { slug: 'carlton', name: 'Carlton', region: 'St George', neighbours: ['kogarah', 'allawah', 'bexley'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'allawah', name: 'Allawah', region: 'St George', neighbours: ['hurstville', 'carlton', 'kogarah', 'south-hurstville'], station: { line: 'T4 Illawarra' }, core: true },
  { slug: 'sans-souci', name: 'Sans Souci', region: 'St George', neighbours: ['kogarah', 'blakehurst', 'brighton-le-sands'], station: null, core: true },
  { slug: 'blakehurst', name: 'Blakehurst', region: 'St George', neighbours: ['south-hurstville', 'kogarah', 'sans-souci', 'sylvania'], station: null, core: true },
  { slug: 'south-hurstville', name: 'South Hurstville', region: 'St George', neighbours: ['hurstville', 'allawah', 'blakehurst'], station: null, core: true },
  { slug: 'kingsgrove', name: 'Kingsgrove', region: 'St George', neighbours: ['beverly-hills', 'hurstville', 'bexley', 'narwee'], station: { line: 'T8 Airport and South' }, core: true },
  { slug: 'narwee', name: 'Narwee', region: 'St George', neighbours: ['beverly-hills', 'riverwood', 'kingsgrove'], station: { line: 'T8 Airport and South' }, core: true },
  { slug: 'lugarno', name: 'Lugarno', region: 'St George', neighbours: ['peakhurst', 'mortdale', 'oatley', 'riverwood'], station: null, core: true },
  { slug: 'brighton-le-sands', name: 'Brighton-Le-Sands', region: 'St George', neighbours: ['rockdale', 'sans-souci', 'arncliffe'], station: null, core: true },
  { slug: 'arncliffe', name: 'Arncliffe', region: 'St George', neighbours: ['rockdale', 'bexley', 'brighton-le-sands'], station: { line: 'T4 Illawarra' }, core: true },

  // Sutherland Shire
  { slug: 'sutherland', name: 'Sutherland', region: 'Sutherland Shire', neighbours: ['jannali', 'kirrawee', 'engadine', 'menai'], station: { line: 'T4 Illawarra' } },
  { slug: 'jannali', name: 'Jannali', region: 'Sutherland Shire', neighbours: ['sutherland', 'como', 'sylvania', 'kirrawee'], station: { line: 'T4 Illawarra' } },
  { slug: 'como', name: 'Como', region: 'Sutherland Shire', neighbours: ['jannali', 'oatley', 'sylvania'], station: { line: 'T4 Illawarra' } },
  { slug: 'kirrawee', name: 'Kirrawee', region: 'Sutherland Shire', neighbours: ['sutherland', 'gymea', 'jannali'], station: { line: 'T4 Illawarra' } },
  { slug: 'gymea', name: 'Gymea', region: 'Sutherland Shire', neighbours: ['kirrawee', 'miranda', 'sylvania'], station: { line: 'T4 Illawarra' } },
  { slug: 'miranda', name: 'Miranda', region: 'Sutherland Shire', neighbours: ['gymea', 'caringbah', 'sylvania'], station: { line: 'T4 Illawarra' } },
  { slug: 'caringbah', name: 'Caringbah', region: 'Sutherland Shire', neighbours: ['miranda', 'cronulla', 'sylvania'], station: { line: 'T4 Illawarra' } },
  { slug: 'cronulla', name: 'Cronulla', region: 'Sutherland Shire', neighbours: ['caringbah', 'miranda'], station: { line: 'T4 Illawarra' } },
  { slug: 'engadine', name: 'Engadine', region: 'Sutherland Shire', neighbours: ['sutherland', 'menai'], station: { line: 'T4 Illawarra' } },
  { slug: 'menai', name: 'Menai', region: 'Sutherland Shire', neighbours: ['sutherland', 'engadine', 'lugarno'], station: null },
  { slug: 'sylvania', name: 'Sylvania', region: 'Sutherland Shire', neighbours: ['blakehurst', 'miranda', 'jannali', 'como', 'gymea'], station: null },

  // South-west Sydney
  { slug: 'padstow', name: 'Padstow', region: 'South-west Sydney', neighbours: ['riverwood', 'revesby', 'panania'], station: { line: 'T8 Airport and South' } },
  { slug: 'revesby', name: 'Revesby', region: 'South-west Sydney', neighbours: ['padstow', 'panania', 'bankstown'], station: { line: 'T8 Airport and South' } },
  { slug: 'panania', name: 'Panania', region: 'South-west Sydney', neighbours: ['revesby', 'padstow'], station: { line: 'T8 Airport and South' } },
  { slug: 'bankstown', name: 'Bankstown', region: 'South-west Sydney', neighbours: ['revesby', 'padstow', 'riverwood'], station: null },
] as const;

export const REGIONS: readonly Region[] = ['St George', 'Sutherland Shire', 'South-west Sydney'];

export function suburbBySlug(slug: string): Suburb | undefined {
  return SUBURBS.find((s) => s.slug === slug);
}

export function suburbsInRegion(region: Region): Suburb[] {
  return SUBURBS.filter((s) => s.region === region);
}

export function neighboursOf(s: Suburb): Suburb[] {
  return s.neighbours.map(suburbBySlug).filter((n): n is Suburb => !!n);
}

/** Human list: "Allawah, Penshurst and Beverly Hills". */
export function listNames(items: readonly { name: string }[]): string {
  const names = items.map((i) => i.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
