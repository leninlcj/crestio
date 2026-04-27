// Client-safe constant for the marketing footer "ship velocity" pill.
// Bumped when we add a new entry to /content/changelog.md.
//
// Why a hardcoded constant instead of computing from the file? The footer
// is a client component, and lib/changelog.ts uses `fs`. Splitting the
// constant into its own no-fs module is the cleanest separation.
//
// The /changelog page itself shows the live entries via getStaticProps.

export const SHIP_VELOCITY_90D = 9;
