# Marketing copy: human translation review list

DeepL gives a competent first pass, but loses idiom, wordplay, brand
voice, and CTA punch. The keys below are flagged for a native-speaker
pass per locale. Sort: P0 → P1 → P2.

- **P0** = homepage hero + primary CTA. Highest visibility, biggest
  conversion impact.
- **P1** = feature headlines, pricing card surfaces, secondary CTAs.
- **P2** = body copy, FAQ, meta tags, sentence fragments around links.

Source language is English (`public/locales/en/marketing.json` unless
noted). Do not rewrite the English here — flag only.

---

## P0 — homepage hero + primary CTA

| Key | English source | Why review |
|---|---|---|
| `marketing.hero.heading` | "The all-in-one tool for tutors who take their work seriously." | Brand-voice value prop. "Take their work seriously" is idiomatic; literal translations sound condescending or imply other tutors are lazy. |
| `marketing.hero.subheading` | "Manage students, log sessions, polish notes with AI, and share progress with parents — from one dashboard. For independent tutors and small teams." | Long, comma-rich rhythm; "polish notes" is wordplay on the verb (see polish feature). Risk of overflow in DE/FR equivalents. |
| `marketing.hero.cta` | "Start free trial" | Primary CTA. Tone must match each locale's conversion conventions (imperative vs. invitation). |
| `marketing.hero.price_note` | "From {{price}}/month. 7-day free trial. Cancel anytime." | Rhythmic three-clause CTA support. "Cancel anytime" is a reassurance idiom, often softened in other languages. |
| `marketing.hero.see_plans` | "See all plans →" | Secondary CTA; arrow + verb. Some locales prefer "View" over "See"; punctuation rules vary. |
| `marketing.hero.eyebrow` | "For independent tutors and small teams" | Positioning statement; "independent" can DeepL into "self-employed" which shifts meaning. |
| `marketing.nav.start_trial` | "Start free trial" | Mirror of hero CTA; must match for consistency across nav and hero. |

## P1 — feature headlines, pricing surfaces, secondary CTAs

| Key | English source | Why review |
|---|---|---|
| `marketing.pain.heading` | "Running a tutoring practice shouldn't feel like this." | Rhetorical setup; "shouldn't feel like this" is conversational and easy to translate flatly. |
| `marketing.pain.line_1` | "You taught six sessions this week and haven't invoiced for two of them." | Specific you-voice scenario; numbers + tense risk awkwardness. |
| `marketing.pain.line_2` | "You wrote notes on paper, typed them into a Google Doc, and will eventually summarise them for the parent." | Multi-clause flow; "eventually" carries resigned tone DeepL flattens. |
| `marketing.pain.line_3` | "Three parents texted you tonight asking the same question." | Pain-point rhythm; "texted" is colloquial and lacks 1:1 equivalents in many locales. |
| `marketing.pain.line_4` | "You're spending two hours on admin for every five hours of actual tutoring." | Ratio framing; "actual tutoring" carries emphasis. |
| `marketing.features.session_log.title` | "Log sessions in seconds" | CTA-style headline; "in seconds" is hyperbolic shorthand. |
| `marketing.features.polish.title` | "Polish notes with AI" | **Wordplay risk**: "Polish" is a verb here, not the nationality. Already flagged in `_contexts.json`; keep in human review to verify per-locale rendering. |
| `marketing.features.invoices.title` | "Invoice without the chase" | **Idiom**: "the chase" = chasing payment. Direct translation = nonsense. |
| `marketing.features.parent_portal.title` | "Give parents their own portal" | Imperative; "their own" carries ownership signal that can be lost. |
| `marketing.pricing.heading` | "One tool. Three plans. Pick what fits." | **Cadence**: three short sentences; rhythm carries the message. |
| `marketing.pricing.subheading` | "Most Australian tutors start on Solo. Growing a team? Go Team." | **Wordplay**: "Solo"/"Team" double as plan names + descriptors. "Go Team" reads as a cheer. |
| `marketing.pricing.recommended_banner` | "Recommended for most tutors" | Card-banner CTA; brevity matters for layout. |
| `marketing.pricing.annual_save_note` | "(save 2 months)" | **Idiom**: "save 2 months" = save 2 months' worth of cost. Literal = "preserve 2 months". |
| `marketing.tiers.solo.subhead` | "For one tutor, one student list." | Parallel-structure rhythm; matches team/growth subheads. |
| `marketing.tiers.team.subhead` | "For owners with a small team of tutors." | Parallel structure; "owners" can DeepL ambiguously. |
| `marketing.tiers.growth.subhead` | "For tutoring businesses scaling up." | "Scaling up" is startup jargon, not universal. |
| `marketing.tiers.solo.cta` | "Start 7-day free trial" | CTA + interpolated number; check word order in target. |
| `marketing.tiers.team.cta` | "Start 14-day free trial" | Same. |
| `marketing.tiers.growth.cta` | "Contact us" | Sales CTA; tone varies (formal vs. casual) per locale. |
| `marketing.final_cta.headline` | "Try Crestio for a week. See if it's for you." | **Brand voice**: low-pressure invitation; flat translations sound transactional. |
| `marketing.final_cta.button` | "Start free trial" | CTA; mirror of hero. |
| `marketing.deleted_banner` | "Your account has been deleted. Sorry to see you go." | **Idiom**: "Sorry to see you go" doesn't translate literally in most locales. |

## P2 — body copy, FAQ, meta, sentence fragments

| Key | English source | Why review |
|---|---|---|
| `marketing.meta.home_title` | "Crestio — software for Australian tutors" | SEO meta; brand name + descriptor; em dash may strip in some search engines. |
| `marketing.meta.home_description` | "Manage students, log sessions, polish notes with AI, and share progress with parents — from one dashboard. From $24/month. 7-day free trial." | SEO meta description; length sensitive (~155 chars). "Polish" wordplay carried over. |
| `marketing.meta.contact_title` | "Contact · Crestio" | Page title; middle dot is conventional in EN, less so elsewhere. |
| `marketing.features.session_log.body` | "Pick a student, pick the time, jot the notes. The same form covers today's session and one you forgot to log last Tuesday. No calendar-app detour." | Cadence + "calendar-app detour" idiom. |
| `marketing.features.session_log.caption` | "The session log form." | Caption — short. |
| `marketing.features.polish.body` | "Write the rough version fast. One click rewrites it into something a parent can actually read — short, warm, specific. Your notes stay yours; the polished version is separate." | **Idioms**: "rough version", "stay yours"; "Polish" wordplay carried. |
| `marketing.features.polish.caption` | "Rough notes on the left, polished on the right." | **Wordplay**: "polished" = participle, not nationality. |
| `marketing.features.invoices.body` | "Completed sessions turn into line items. Generate an invoice, mark it paid when the bank transfer lands. No separate spreadsheet of who owes what." | "When the bank transfer lands" is colloquial; "who owes what" is rhetorical pairing. |
| `marketing.features.invoices.caption` | "The invoice list, paid vs unpaid." | Short caption; "vs" abbrev style varies. |
| `marketing.features.parent_portal.body` | "Invite a parent and they get a simple view of their child's sessions, homework, and polished notes. They stop texting you at 9pm because they already know how things are going." | Conversational rhythm; "9pm" formatting. |
| `marketing.features.parent_portal.caption` | "The parent portal." | Caption — short. |
| `marketing.features.*.alt` (4 keys) | image alt text | Descriptive; check that translated alt matches actual screenshot content per locale. |
| `marketing.pricing.footer_note` | "Prices in AUD. Inclusive of GST where applicable. Cancel anytime." | AUD/GST is Australian; for non-AU markets, may need locale-specific override. |
| `marketing.pricing.period_annual` | "per year — about {{monthly_equivalent}}/month billed annually" | Multi-clause with em dash + interpolation; word order risk. |
| `marketing.tiers.solo.features.unlimited` | "Unlimited students and sessions" | Bullet copy — short, but "Unlimited" wording matters. |
| `marketing.tiers.solo.features.polish` | "AI-polished notes for parents" | Wordplay carried. |
| `marketing.tiers.team.features.inherits` | "Everything in Solo, plus:" | Sentence fragment, ends in colon; punctuation rules vary. |
| `marketing.tiers.growth.features.inherits` | "Everything in Team, plus:" | Same. |
| `marketing.faq.heading` | "Things tutors have asked" | Brand voice ("Things" is informal). |
| `marketing.faq.q1`–`q6` | FAQ questions | Conversational; check natural question phrasing. |
| `marketing.faq.a1_part1` | "Yes. Data is stored on Supabase infrastructure and payments go through Stripe, so Crestio never sees your card details. Every organisation's data is isolated — no tutor can see another practice's students. Full details in the " | **Sentence fragment** that ends mid-clause; concatenated with `a1_privacy_link` + `a1_part2`. Word order changes break it. Consider Trans component or single key. |
| `marketing.faq.a1_privacy_link` | "privacy policy" | Linked text; spelling/casing convention varies (capitalised in EN, lowercase common in many EU locales). |
| `marketing.faq.a1_part2` | "." | Period only — but in some locales this fragment placement breaks. |
| `marketing.faq.a2` | "The AI polishes your rough session notes into something parents can read clearly..." | "Polish" wordplay carried. |
| `marketing.faq.a3` | "Your card gets charged for the plan you chose. Cancel before the trial ends and nothing happens..." | Conditional rhythm. |
| `marketing.faq.a4` | "Only what you share. Session notes split into internal (yours) and parent-facing (shared)..." | Parenthetical asides may translate awkwardly. |
| `marketing.faq.a5` | "Both. Solo is for independent tutors. Team fits small tutoring practices up to 5 tutors. Growth supports up to 15. If you're running a larger operation, email support@crestio.ai and we'll point you in the right direction." | **Idiom**: "point you in the right direction". |
| `marketing.faq.a6` | "The Crestio team. We're a small team based in Australia, building software for tutors who value their time. Questions or feedback? Email support@crestio.ai and a person reads every message." | Brand-voice paragraph; "a person reads every message" idiomatic warmth. |
| `marketing.final_cta.questions_part1` | "Questions first? Email " | **Sentence fragment** before mailto link. |
| `marketing.final_cta.questions_part2` | "." | Period only. |
| `marketing.footer.made_in` | "Made in Australia · 2026" | Hard-coded year; revisit annually. |
| `marketing.contact.heading` | "Say hello" | **Brand voice**: casual greeting; literal translations sound stiff. |
| `marketing.contact.intro` | "Questions, bug reports, feedback, praise, complaints — all welcome. One human reads these and writes back, usually within a day." | Long brand-voice paragraph; "One human" carries warmth. |
| `marketing.contact.submit` | "Open in Mail" | "Mail" = the OS app; capital M is intentional. May not localise cleanly. |
| `marketing.contact.submit_note` | "This opens your default email app with the message drafted. Nothing is sent until you send it yourself." | Reassurance idiom. |
| `marketing.contact.footer_location` | "crestio · Sydney · 2026" | Brand stamp; lowercase "crestio" intentional. |
| `marketing.contact.subject_named` | "Message from {{name}}" | Email subject template — keep short for inbox preview. |
| `marketing.contact.subject_anonymous` | "Message from Crestio website" | Same. |
| `marketing.contact.body_from` | "From: {{name}}" | Email body header. |
| `marketing.contact.body_reply_to` | "Reply to: {{email}}" | Email body header. |

---

## Counts

- P0: 7 keys
- P1: 22 keys
- P2: 36 keys
- **Total flagged: 65 keys**

## Out of scope

Email subject lines and bodies live in `emails.json` (transactional, not
marketing) and are not flagged here. Pricing tier feature bullets that
are purely literal (e.g. "Up to 5 tutors with role-based access") are
not flagged — DeepL handles them well.
