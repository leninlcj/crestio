# Browser support — Phase 6

Method: code review for known browser-specific patterns + manual smoke
test of the core conversion flow on the developer's machine. Production
analytics will replace this with real telemetry once we have enough
volume.

## Targets

| Browser | Version | Status |
|---|---|---|
| Safari (macOS) | 17+ | Smoke-tested |
| Safari (iOS) | 16+ | Smoke-tested |
| Chrome | 120+ | Smoke-tested |
| Firefox | 120+ | Smoke-tested |
| Edge | 120+ | Inferred via Chromium parity |

## Known browser-specific behavior

### Safari (macOS + iOS)

- **Backdrop blur** (`backdrop-blur-md` on `MarketingNav` and Layout
  top bar): renders correctly via `-webkit-backdrop-filter`. We provide
  both prefixed and standard via Tailwind's `supports-[backdrop-filter]`
  fallback.
- **`text-balance`**: Safari 17.4+ supports it. On older Safari it
  silently falls back to default wrapping — acceptable.
- **Sandbox iframe**: tested. Local React state inside the iframe
  persists for the iframe's lifetime; closing the parent tab cleans up.
- **`<details>` open animation**: Safari does not animate the `open`
  attribute. The FAQ items still open cleanly — just instantly instead
  of with a slide. Not regressed.
- **`prefers-reduced-motion`**: respected via the global `@media`
  rule in `globals.css`. Tested with macOS System Settings → Display →
  Reduce Motion.

### Safari (iOS specifically)

- **Watermark on `/files/[id]`**: text-rendering at 8% opacity holds at
  the spec's 240px grid spacing. Re-confirmed during phase 6 audit;
  no change.
- **Pull-to-refresh on the parent portal**: not implemented. iOS users
  can drag-down to refresh via the browser chrome — expected behavior.
- **`100vh` issues**: we use `min-h-screen` which is `100vh` — Safari
  iOS used to compute this as the wrong value when the URL bar
  was visible. Modern Safari handles this correctly.

### Chrome / Edge

- No issues. Both render the design system identically to the macOS
  Safari baseline.

### Firefox

- **Tabular numbers**: `font-variant-numeric: tabular-nums` works in all
  current Firefox builds.
- **Scrollbar styling**: our `.scrollbar-thin` uses `scrollbar-width`
  (Firefox property) AND the WebKit pseudo-elements. Both supported.

## Modifier-key handling (⌘ vs Ctrl)

`useKeyboard` checks `navigator.platform` to swap `Cmd` for `Ctrl` on
non-mac systems. ⌘K palette opens with Ctrl+K on Windows/Linux. Verified.

## Email rendering (touched briefly in phase 6 only)

The `weeklyDigest` HTML uses table-based layout, inline CSS, max 600px
width — the four-client smoke test (Gmail web, Apple Mail, Outlook web,
iOS Mail) is queued for phase 7 once we're sending real digests at
scale. The PDF rendering via pdf-lib is independent of email clients
and renders identically in every PDF reader.

## Polyfills / shims used

- `Intl.NumberFormat` — assumed native. All target browsers ship it.
- `IntersectionObserver` — used by `SandboxEmbed`, `StickyConversionBar`.
  Native in all targets.
- `requestAnimationFrame` — used by `useCountUp`. Native in all targets.
- `crypto.randomUUID` — not used outside Supabase/Stripe SDK contexts.

## Outstanding

- **Wire real telemetry** to track engagement quality per browser
  family — replace this doc with empirical findings.
- **Run an automated cross-browser test** (BrowserStack or Playwright)
  against the conversion flow before the next major release.
