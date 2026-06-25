# Bourbon Buddy — UI/UX Design Brief

**Version:** 1.0
**Last Updated:** 2026-06-24
**Audience:** Claude Code and any developer working on the Bourbon Buddy frontend

---

## Design Philosophy

**"Bourbon Bar at Midnight."**

The app should feel like a really good whiskey bar — dark, warm, intentional, a little moody. The aesthetic is sophisticated enough to use in public without embarrassment, but the personality underneath is self-aware and occasionally funny. It takes bourbon seriously. It does not take itself too seriously.

Two layers always coexist:
- **The shell:** dark, glassy, premium. Serious about the craft.
- **The personality layer:** unexpected moments of humor and warmth, placed deliberately. Never forced. Never overdone.

This combination is the differentiator. Apps like Distiller and Whiskeybase do the sleek part well. None of them have a Bigfoot on the sighting button.

---

## Color System

All colors referenced by token name throughout this document. Use CSS custom properties defined in `src/theme/variables.css`.

### Palette

| Token | Hex | Role |
|---|---|---|
| `--color-bg-primary` | `#141210` | App background — near-black with warm brown undertone |
| `--color-bg-surface` | `#1E1A17` | Card and surface background |
| `--color-bg-elevated` | `#272219` | Elevated surfaces, inputs, modals |
| `--color-amber` | `#C8873A` | Primary accent — bourbon in candlelight |
| `--color-amber-light` | `#E8A85A` | Hover states, highlights, active tab indicator |
| `--color-amber-dim` | `#8A5C28` | Muted amber for secondary actions, borders |
| `--color-copper` | `#B07040` | Secondary accent, icons, decorative elements |
| `--color-text-primary` | `#F0E8DC` | Primary text — warm cream, not pure white |
| `--color-text-secondary` | `#A89880` | Secondary text, labels, metadata |
| `--color-text-disabled` | `#5C5248` | Disabled states, placeholder text |
| `--color-border` | `#2E2820` | Subtle borders between elements |
| `--color-border-bright` | `#4A3C30` | More visible borders, dividers |
| `--color-success` | `#5A9E6A` | Success states (warm green, not clinical) |
| `--color-error` | `#C0504A` | Error states |
| `--color-unicorn` | `#9B6FD4` | Unicorn/Grail tier — a distinctive purple-violet |
| `--color-unicorn-glow` | `#C4A0F0` | Unicorn badge glow accent |

### Glass Effect

The frosted glass treatment is used on cards, modals, and action sheets. It is **not** applied everywhere — overuse kills the effect.

```css
.glass-surface {
  background: rgba(30, 26, 23, 0.75);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border: 1px solid rgba(200, 135, 58, 0.12);
  border-radius: 16px;
}

.glass-modal {
  background: rgba(22, 18, 14, 0.88);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border-top: 1px solid rgba(200, 135, 58, 0.18);
}
```

### Category Color Accents

Each whiskey category gets a left-border accent color on its log entry card. This is the only place category colors appear — not a full color change, just a 3px left border.

| Category | Accent Color | Hex |
|---|---|---|
| Bourbon | Amber | `#C8873A` |
| Rye | Warm copper-red | `#C05A3A` |
| Scotch | Slate blue | `#5A7A9E` |
| Irish | Muted green | `#5A8A6A` |
| Japanese | Cool silver | `#8A9AAA` |
| Tennessee | Golden | `#B89840` |
| Other | Neutral copper | `#887060` |

---

## Typography

Two typefaces. No exceptions.

### Display Face — Playfair Display
Used for: bourbon names on cards, page titles, section headers, the app wordmark.

```css
font-family: 'Playfair Display', Georgia, serif;
```

Import via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
```

Playfair Display is used **with restraint** — it carries the personality of a distillery label. It should never appear at small sizes (minimum 18px) and should not be used for body copy or UI labels.

### Body / UI Face — DM Sans
Used for: all body text, UI labels, form fields, navigation, metadata, everything that isn't a title.

```css
font-family: 'DM Sans', -apple-system, sans-serif;
```

Import via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
```

### Type Scale

| Role | Typeface | Size | Weight | Color Token |
|---|---|---|---|---|
| App wordmark | Playfair Display | 28px | 700 | `--color-amber` |
| Page title | Playfair Display | 24px | 600 | `--color-text-primary` |
| Bourbon name (card) | Playfair Display | 20px | 600 | `--color-text-primary` |
| Bourbon name (detail) | Playfair Display | 26px | 700 | `--color-text-primary` |
| Section header | DM Sans | 12px | 600 | `--color-text-secondary` |
| Body text | DM Sans | 15px | 400 | `--color-text-primary` |
| Label / metadata | DM Sans | 13px | 400 | `--color-text-secondary` |
| Caption / timestamp | DM Sans | 12px | 300 | `--color-text-secondary` |
| Button text | DM Sans | 15px | 600 | varies |
| Tab bar label | DM Sans | 10px | 500 | varies |

All text is sentence case. Never all-caps except for section eyebrow labels (e.g., "TASTING NOTES"), which use DM Sans 11px / 600 / letter-spacing 1.5px / `--color-text-secondary`.

---

## App Wordmark & Icon

**Wordmark:** "Bourbon" set in Playfair Display 700, "Buddy" set in Playfair Display 400 italic, in `--color-amber`. The weight contrast within the same typeface communicates the dual personality: serious bourbon, friendly buddy.

**App Icon:** The two B letters of "Bourbon Buddy" treated as a monogram. A stylized BB with an amber whiskey glass silhouette integrated — the round bowl of a Glencairn glass forms the inner counter of one of the B's. Icon background is `--color-bg-primary`. Works as PWA icon and eventual App Store icon.

---

## Navigation

### Bottom Tab Bar

Ionic `<ion-tab-bar>` styled to match the design system.

```
| Cellar | Hunt List | Dispatch | The Numbers | Search |
```

- **Cellar** — the bourbon log (formerly "Log")
- **Hunt List** — the wishlist (formerly "Wishlist")
- **Dispatch** — the news feed (formerly "News")
- **The Numbers** — statistics (formerly "Stats")
- **Search** — global search

Tab bar background: `--color-bg-surface` with a top border of `--color-border-bright`.
Active tab: icon and label in `--color-amber-light`.
Inactive tab: icon and label in `--color-text-disabled`.

Icons use a consistent outline icon set (Ionicons outline variants). The one exception: the sighting action (see Personality Layer below).

### Page Headers

Ionic `<ion-header>` with `translucent` set to true on iOS for the blur effect. Header background matches `--color-bg-surface`. Page titles in the display typeface. No heavy toolbar borders — use the subtle shadow from translucency.

---

## Card Design — Log Entry Card

The log entry card is the most frequently seen UI element. It needs to be immediately scannable.

```
┌─────────────────────────────────────────────┐
│ ▌  [Label Photo]  Blanton's Original        │
│ ▌  thumbnail      Buffalo Trace             │
│ ▌  (72×72)        ★★★★½   · Bourbon        │
│ ▌                 Jun 12  · Bottle          │
└─────────────────────────────────────────────┘
```

- Left border: 3px, category accent color
- Label photo: 72×72 rounded square (radius 8px), right-aligned; falls back to a Glencairn silhouette illustration in `--color-border-bright` if no photo
- Bourbon name: Playfair Display 20px/600, `--color-text-primary`
- Distillery: DM Sans 13px/400, `--color-text-secondary`
- Rating: whiskey glass widget (see Rating Widget below), inline
- Metadata row: category badge + entry type + date, DM Sans 12px, `--color-text-secondary`
- Card background: `glass-surface` class
- Spacing: 16px padding all sides; 12px gap between cards

**Unicorn badge:** If a log entry was tagged as a Grail/Unicorn tier (carried over from wishlist), a small unicorn badge appears in the top-right corner of the card. See Unicorn Treatment below.

---

## Card Design — Wishlist Entry Card

```
┌─────────────────────────────────────────────┐
│  Pappy Van Winkle 23 Year          🦄       │
│  Buffalo Trace                              │
│  MSRP $299  ·  Best: $340 (+14%)           │
│  ████░ Grail  ·  Actively Looking          │
└─────────────────────────────────────────────┘
```

- Bourbon name: Playfair Display 20px/600
- Distillery: DM Sans 13px/400, `--color-text-secondary`
- Pricing row: DM Sans 14px; MSRP in `--color-text-secondary`, best price in `--color-text-primary`, delta in `--color-error` (above MSRP) or `--color-success` (below MSRP)
- Priority badge: colored pill — Grail uses `--color-unicorn` background; High/Normal/Low use `--color-amber-dim` background at varying opacities with `--color-text-secondary` text
- Unicorn icon: only on Grail tier (see Unicorn Treatment)

---

## Rating Widget — Whiskey Glass Fill

Five Glencairn glass outlines in a row. Each glass fills from bottom to top with `--color-amber` based on the rating. Half-fill = half a star (liquid halfway up the glass bowl).

**Implementation notes:**
- SVG-based component: `<app-rating-widget [rating]="entry.rating" [interactive]="true/false">`
- In interactive mode (entry form), user taps a glass to set the rating; tapping the already-selected glass at a full position sets half-fill
- In display mode (cards, detail views), glasses are static SVG fills
- Animation on interactive tap: a brief amber liquid-pour fill animation (~200ms ease-out)
- Empty glass fill color: `--color-border-bright`
- Filled glass fill color: `--color-amber`

The five glasses display inline with 6px gap between them. Total width approximately 140px for cards, scales slightly larger (160px) on detail screens.

---

## The Personality Layer

### Sighting Button — Bigfoot

The "Log a Sighting" action uses a custom Bigfoot silhouette icon. This appears in two places:

1. **On the wishlist entry detail page:** A button labeled "Report a Sighting" with the Bigfoot outline icon to the left of the text
2. **On the Cellar (log) entry detail page:** Same treatment for adding a sighting from a logged bottle

The Bigfoot icon is an SVG silhouette — the classic striding figure, simplified to about 24×24px. Color: `--color-amber`.

**Microcopy around sightings:**
- Button label: *"Report a Sighting"*
- Success toast after saving: *"Sighting logged. People are going to believe you."*
- Stale sighting badge (>60 days old): *"May have moved on."*
- Manual "mark stale" confirmation: *"Mark as the one that got away?"*
- Empty sightings list: *"No sightings yet. Keep your eyes open."*

### Unicorn Treatment — Grail Tier

Any wishlist entry or log entry marked as Grail / Unicorn tier gets the unicorn badge.

**The badge:** A small circular badge (24×24px) containing a unicorn silhouette SVG. Background: a subtle radial gradient from `--color-unicorn` to transparent. The unicorn silhouette is in `--color-unicorn-glow`. The badge pulses with a very subtle glow animation on the detail screen (not on list cards — too distracting).

```css
@keyframes unicorn-pulse {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(155, 111, 212, 0.3); }
  50% { box-shadow: 0 0 10px 3px rgba(155, 111, 212, 0.6); }
}

.unicorn-badge {
  animation: unicorn-pulse 3s ease-in-out infinite;
}
```

**When a Grail bottle is logged (moved from wishlist to log):**
A brief celebratory moment on the success screen. The standard success state is replaced with a full-panel moment: unicorn badge large (64px), animated pulse, copy reads:

> *"You actually found one."*
> *"[Bourbon Name] is now in your Cellar."*

Then auto-navigates to the new log entry after 2 seconds, or immediately on tap.

**Microcopy around Grail/Unicorn entries:**
- Priority badge label: *"Unicorn"* (not "Grail")
- Detail page subheader under bourbon name: a faint *"🦄 Unicorn Bottle"* label in `--color-unicorn`
- Tooltip on the badge (long press): *"The ones worth waiting for."*

---

## Empty States

Each empty state has an illustration (simple line art SVG, warm amber/copper tones) and two lines of copy: a headline and a CTA.

| Screen | Illustration | Headline | CTA |
|---|---|---|---|
| Cellar (log) | Empty Glencairn glass | *"Your glass is empty."* | *"Log your first bourbon"* |
| Hunt List | Treasure map with X | *"Nothing on the radar yet."* | *"Add a bottle to hunt"* |
| Dispatch (news) | Rolled newspaper | *"Nothing's breaking yet."* | Pull to refresh |
| Search — no results | Blurry Bigfoot photo | *"Nothing found. Like most Bigfoot photos."* | — |
| Sightings — empty | Foggy forest path | *"No sightings yet. Keep your eyes open."* | *"Report a sighting"* |
| Pour sessions — empty | Empty bottle | *"No pours logged yet."* | *"Log a dram"* |
| Stats — not enough data | Baby bar chart | *"Not enough data yet. Keep logging."* | — |

---

## Microcopy & Voice

The app speaks in a voice that is:
- Direct and plain — no filler words, no "Please don't forget to..."
- Occasionally dry — the humor is deadpan, not exclamation-mark enthusiastic
- Knowledgeable without being a snob — uses bourbon terms correctly but never explains them condescendingly

### Renamed UI Elements

| Standard Label | Bourbon Buddy Label |
|---|---|
| Log / Journal | Cellar |
| Wishlist | Hunt List |
| News | Dispatch |
| Statistics | The Numbers |
| Settings | — (keep as Settings; no need to rename) |
| Add Pour Session | Log a Dram |
| Add Sighting | Report a Sighting |
| Log Entry | — (context-dependent; use "bottle" or "pour") |
| Move to Log | Found It — Log It |
| Archive | The Ones That Got Away (wishlist archive) |

### Action Confirmations & Toasts

| Action | Toast / Confirmation |
|---|---|
| Log entry saved | *"Added to your Cellar."* |
| Log entry deleted | *"Removed."* (simple; no need for personality here) |
| Wishlist entry saved | *"Added to the Hunt List."* |
| Sighting saved | *"Sighting logged. People are going to believe you."* |
| Grail bottle logged | Full celebratory screen (see Unicorn Treatment) |
| Article saved | *"Saved for later."* |
| Article dismissed | *"Gone. Won't show it again."* |
| Pour session saved | *"Dram logged. Sláinte."* |
| Export complete | *"Your Cellar is packed up and ready."* |
| Sign out | *"See you next pour."* |

### Error Messages

Errors are plain and specific — no apologies, no vague "something went wrong."

| Situation | Error Message |
|---|---|
| Network error on save | *"Couldn't save. Check your connection and try again."* |
| Photo upload failed | *"Photo didn't upload. Try again or skip for now."* |
| News feed failed to load | *"Couldn't reach the Dispatch. Pull down to try again."* |
| Auth error (wrong password) | *"Email or password didn't match."* |
| Auth error (email taken) | *"An account with that email already exists."* |

---

## Form Design

### Input Fields

All inputs use a dark background (`--color-bg-elevated`) with a bottom border or full border in `--color-border`. On focus, the border transitions to `--color-amber`.

```css
ion-input, ion-select, ion-textarea {
  --background: var(--color-bg-elevated);
  --color: var(--color-text-primary);
  --placeholder-color: var(--color-text-disabled);
  --border-color: var(--color-border);
  --highlight-color-focused: var(--color-amber);
  border-radius: 10px;
}
```

### Add Entry Form Layout

The Add/Edit Entry form is a single long-scroll page (not multi-step wizard) divided into clearly labeled sections with eyebrow headers. Sections:

1. **THE BOTTLE** — name, distillery, bottler, category, sub-type
2. **BOTTLE DETAILS** — age, proof, mash bill, batch, barrel, series
3. **HOW YOU GOT IT** — entry type, purchase info, did-not-purchase toggle
4. **WHAT YOU THOUGHT** — rating widget, tasting notes by stage, finish length, would buy again
5. **NOTES** — personal notes freeform field, label photo

Each section is separated by a thin `--color-border` divider. Section eyebrow labels in DM Sans 11px / 600 / letter-spacing 1.5px / `--color-text-secondary`.

The rating widget and flavor tag selectors (sections 4) are the most important part of the form — give them more breathing room (24px top padding on this section vs. 16px for others).

### Flavor Tag Selectors

Tag groups arranged horizontally as scrollable chip rows within each stage (Nose, Palate, Finish). Each stage is collapsible (expanded by default).

- Unselected tag chip: background `--color-bg-elevated`, border `--color-border`, text `--color-text-secondary`
- Selected tag chip: background `--color-amber-dim`, border `--color-amber`, text `--color-amber-light`
- Chip shape: pill, 8px vertical padding, 14px horizontal padding, DM Sans 13px/500

No icons on flavor tags — text only.

### Save Button

Full-width Ionic button, pinned to the bottom of the page (sticky footer), background `--color-amber`, text `--color-bg-primary` (dark text on amber). Rounded corners (12px). DM Sans 15px/600. Labeled *"Save to Cellar"* on log entries, *"Save"* on wishlist and settings forms.

---

## Modal / Sheet Design

Ionic `<ion-modal>` with `breakpoints` set for bottom sheet presentation. Styling:

- Background: `glass-modal` class (heavily frosted, dark)
- Top edge: rounded corners (20px radius)
- Drag handle: a short centered bar in `--color-border-bright`
- Internal padding: 24px
- Title within sheet: Playfair Display 20px/600 for bourbon-related sheets; DM Sans 17px/600 for utility sheets (filter, settings)

---

## Micro-interactions & Motion

Restraint is the rule. Each animation has a purpose.

| Interaction | Animation |
|---|---|
| FAB tap | Amber radial ripple, 150ms |
| Rating glass tap | Liquid pour fill, 200ms ease-out per glass |
| Sighting button tap | Brief "radar ping" ring expand, 300ms |
| Unicorn badge (detail) | Glow pulse, 3s loop, subtle |
| Grail bottle logged | Unicorn badge scale-in + glow pulse, 400ms |
| Card tap | Slight scale-down (0.98) on press, 100ms |
| Pull to refresh | Spinning barrel icon (custom Lottie or CSS animation) |
| Tab switch | No animation — instant, keeps the UI feeling fast |
| Modal present | Slides up from bottom, 280ms ease-out |
| Toast appear | Slides down from top, 200ms, auto-dismisses after 3s |

`prefers-reduced-motion` media query is respected — all animations collapse to instant/opacity transitions.

---

## Value Score Display

The value score appears on log entry detail screens and as an optional sort in the list. It is never shown without context.

Display format on detail screen:

```
VALUE SCORE
   87.3
"Punches above its weight."
```

The contextual label changes based on score range:

| Score | Label |
|---|---|
| 80+ | *"Punches above its weight."* |
| 60–79 | *"Pays its way."* |
| 40–59 | *"Fair trade."* |
| Below 40 | *"Love costs what it costs."* |

Score displayed in Playfair Display 32px/700, `--color-amber`. Label in DM Sans 13px/400 italic, `--color-text-secondary`. Info icon (ⓘ) next to the score opens a tooltip: *"Rating per dollar. Higher is better value."*

**Best Value badge:** The single log entry with the highest value score in the user's Cellar displays a small rosette badge — a gold/amber circular ribbon icon (24px) in the top-right corner of its card. Label on hover/long-press: *"Best Pour in Your Cellar."* Only one entry holds this badge at a time; it updates automatically when entries are added or edited.

---

## Onboarding

First-time launch after install/login: a single full-screen welcome moment before entering the app.

- Background: `--color-bg-primary` with a very subtle radial gradient warmth from center
- Center: App wordmark (large, 40px)
- Below wordmark: tagline in DM Sans 16px/300 italic, `--color-text-secondary`

Tagline options (pick one during development):
- *"Every dram, remembered."*
- *"Your bourbon. Your story."*
- *"Track it. Hunt it. Drink it."*

- Single CTA button: *"Let's pour one"* — tapping this dismisses the screen and enters the app
- This screen is shown exactly once (flag in local storage after first dismiss)
- No feature tours, no carousel, no permission prompts on this screen — just the vibe

---

## Specific Screen Specs

### Cellar (Log List) Screen

```
┌─────────────────────────────────────────────┐
│  ≡  Cellar                    [🔍] [⚙ sort] │
│─────────────────────────────────────────────│
│  [ Search your Cellar...           ]        │
│  [Active filters: Bourbon ×] [Rating 4+ ×]  │
│─────────────────────────────────────────────│
│  ▌ [photo]  Blanton's Original    [★★★★½]  │
│  ▌          Buffalo Trace                   │
│  ▌          Bourbon · Bottle · Jun 12       │
│─────────────────────────────────────────────│
│  ▌ [photo]  Eagle Rare 10yr       [★★★★ ]  │
│  ▌          Buffalo Trace                   │
│  ▌          Bourbon · Drink · May 28        │
└─────────────────────────────────────────────│
                   [+ FAB]
```

FAB: `--color-amber` filled circle, `+` icon in `--color-bg-primary`. Positioned bottom-right, 24px from edges.

### Hunt List (Wishlist) Screen

```
┌─────────────────────────────────────────────┐
│  ≡  Hunt List                  [🔍] [⚙sort] │
│─────────────────────────────────────────────│
│  Pappy Van Winkle 23 Year           🦄      │
│  Buffalo Trace                              │
│  MSRP $299  ·  Best seen: $340 (+14%)       │
│  [Unicorn]  [Actively Looking]              │
│─────────────────────────────────────────────│
│  Blanton's Straight from the Barrel         │
│  Buffalo Trace                              │
│  MSRP $120  ·  No sightings yet            │
│  [High]  [Casually Looking]                 │
└─────────────────────────────────────────────┘
                   [+ FAB]
```

### Dispatch (News Feed) Screen

```
┌─────────────────────────────────────────────┐
│  Dispatch                         [⚙ prefs] │
│─────────────────────────────────────────────│
│  [thumb]  Buffalo Trace Releases New...     │
│           Breaking Bourbon  ·  2 hours ago  │
│           The distillery announced today... │
│─────────────────────────────────────────────│
│  [thumb]  BTAC Winners Announced for...     │
│           Whisky Advocate  ·  Yesterday     │
│           The Buffalo Trace Antique...      │
└─────────────────────────────────────────────┘
```

Swipe left on any card to reveal: *"Read"* (gray), *"Save"* (amber), *"Not interested"* (muted red).

### Log Entry Detail Screen (key elements)

```
┌─────────────────────────────────────────────┐
│  ←  [Edit]                                  │
│  [FULL WIDTH LABEL PHOTO]                   │
│─────────────────────────────────────────────│
│  Blanton's Original                         │  ← Playfair Display 26/700
│  Buffalo Trace  ·  Bourbon                  │  ← DM Sans 14/400 secondary
│─────────────────────────────────────────────│
│  [★★★★½]                  VALUE SCORE       │
│                            87.3             │
│                      "Punches above..."     │
│─────────────────────────────────────────────│
│  TASTING NOTES                              │
│  NOSE      [vanilla] [caramel] [oak]        │
│            "Rich vanilla on the nose..."    │
│  PALATE    [cherry] [spice] [honey]         │
│            "Full bodied with..."            │
│  FINISH    [long] [oak] [pepper]            │
│            "Dry oak finish..."              │
│─────────────────────────────────────────────│
│  HOW I GOT IT                               │
│  Bottle  ·  $65.00  ·  Total Wine          │
│  Jun 12, 2026                               │
│─────────────────────────────────────────────│
│  [Log a Dram]     [Report a Sighting 🦶]    │
└─────────────────────────────────────────────┘
```

The Bigfoot silhouette icon appears inline on the "Report a Sighting" button at the bottom of the detail screen.

---

## Ionic Component Overrides (Global Theme)

In `src/theme/variables.css`, override Ionic defaults:

```css
:root {
  /* Map to Ionic expected variables */
  --ion-background-color: var(--color-bg-primary);
  --ion-surface-color: var(--color-bg-surface);
  --ion-text-color: var(--color-text-primary);
  --ion-color-primary: var(--color-amber);
  --ion-color-primary-contrast: var(--color-bg-primary);
  --ion-color-primary-shade: var(--color-amber-dim);
  --ion-color-primary-tint: var(--color-amber-light);
  --ion-font-family: 'DM Sans', -apple-system, sans-serif;
  --ion-tab-bar-background: var(--color-bg-surface);
  --ion-tab-bar-border-color: var(--color-border-bright);
  --ion-tab-bar-color: var(--color-text-disabled);
  --ion-tab-bar-color-selected: var(--color-amber-light);
  --ion-card-background: var(--color-bg-surface);
  --ion-item-background: var(--color-bg-elevated);
  --ion-toolbar-background: var(--color-bg-surface);
  --ion-toolbar-color: var(--color-text-primary);
}
```

---

## PWA Considerations

### manifest.webmanifest

```json
{
  "name": "Bourbon Buddy",
  "short_name": "Bourbon Buddy",
  "theme_color": "#141210",
  "background_color": "#141210",
  "display": "standalone",
  "orientation": "portrait"
}
```

Theme color `#141210` ensures the iOS Safari browser chrome matches the app background when installed as a PWA — seamless, no white flash.

### iOS Safari Specifics

- `<meta name="apple-mobile-web-app-capable" content="yes">` — full-screen PWA mode
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` — status bar overlaps content (handle safe area insets with `env(safe-area-inset-*)`)
- Safe area padding on tab bar and page headers is required on iPhone with notch/Dynamic Island

---

## Asset Checklist

Assets to be created before or during Iteration 2 (when the first real screens are built):

- [ ] App wordmark SVG (Playfair Display BB monogram + wordmark variants)
- [ ] App icon (1024×1024 PNG for PWA manifest; derive all sizes from this)
- [ ] Bigfoot silhouette SVG icon (24×24, scalable)
- [ ] Unicorn silhouette SVG icon (24×24, scalable)
- [ ] Glencairn glass SVG (for rating widget — 5 states: empty, quarter, half, three-quarter, full fill)
- [ ] Default label photo placeholder (Glencairn silhouette, used when no photo exists)
- [ ] Empty state illustrations (5–6 simple line art SVGs: empty glass, treasure map, newspaper, blurry Bigfoot, foggy path, empty bottle)
- [ ] Rosette/ribbon badge SVG (Best Pour badge)
- [ ] Spinning barrel animation (CSS or Lottie, for pull-to-refresh)
- [ ] Google Fonts loaded: Playfair Display (400, 600, 700) + DM Sans (300, 400, 500, 600)
