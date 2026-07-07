/**
 * KAARGAR — Central Theme / Accent System
 * =========================================
 * Single source of truth for the app's accent palette.
 *
 * TO RETHEME THE WHOLE APP:
 *   1. Change --accent-hex in globals.css  (covers all CSS classes + most inline styles)
 *   2. Change HEX below                    (covers SVG color/stroke props & programmatic use)
 *
 * Usage in JSX inline styles  →  style={{ color: accent.primary }}
 * Usage in SVG/icon props     →  <Icon color={accent.hex} />
 * Usage in Tailwind classes   →  use `text-amber-400` or reference --accent via CSS var
 *
 * All values here use CSS custom properties so they automatically
 * respect the :root definition — change the CSS var once and both
 * the CSS and JS sides update.
 */

/* ─────────────────────────────────────────────────────
   RAW HEX — use ONLY for SVG props / Canvas / libraries
   that don't support CSS custom properties.
   ───────────────────────────────────────────────────── */
export const HEX = {
  primary:  '#F59E0B',   // ← main accent (amber orange)
  hover:    '#FBBF24',   // lighter / hover state
  dim:      '#92400E',   // darker discover-button variant
  soft:     '#FDE68A',   // warm cream — text on dim bg
  deep:     '#2D1A06',   // very dark accent background
  card:     '#1A1004',   // darkest card/panel background
  mid:      '#7C4A12',   // mid-dark amber border/divider
  muted:    '#3D2508',   // subtle hover/active muted bg
  on:       '#000000',   // text drawn ON TOP of primary
}

/* ─────────────────────────────────────────────────────
   CSS VAR STRINGS — use for React inline `style` props.
   Automatically picks up :root changes.
   ───────────────────────────────────────────────────── */
export const accent = {
  primary:  'var(--accent)',
  hover:    'var(--accent-hover)',
  dim:      'var(--accent-dim)',
  soft:     'var(--accent-soft)',
  deep:     'var(--accent-deep)',
  card:     'var(--accent-card)',     // darkest card bg
  mid:      'var(--accent-mid)',      // mid-dark border
  muted:    'var(--accent-muted)',    // subtle hover bg
  bgSm:     'var(--accent-bg-sm)',    // rgba @ 6%
  bg:       'var(--accent-bg)',       // rgba @ 10%
  bgMd:     'var(--accent-bg-md)',    // rgba @ 15%
  border:   'var(--accent-border)',   // rgba @ 25%
  on:       'var(--accent-on)',       // text ON accent (#000)
}

/* ─────────────────────────────────────────────────────
   SEMANTIC SHORTCUTS — common patterns used in buttons,
   badges, tabs, etc.
   ───────────────────────────────────────────────────── */

/** Solid primary CTA button */
export const btnPrimary = {
  background: accent.primary,
  color:      accent.on,
  border:     'none',
}

/** Active/selected badge or tab */
export const activeBadge = {
  background: accent.bg,
  color:      accent.primary,
  border:     `1px solid ${accent.border}`,
}

/** Selected state — stronger tint */
export const selectedItem = {
  background:  accent.bgMd,
  borderColor: accent.primary,
  color:       accent.primary,
}

/** Discover / secondary button (dimmed orange) */
export const btnDiscovery = {
  background: accent.dim,
  color:      accent.soft,
  border:     'none',
}

/** Mode toggle — Instant button (active) */
export const modeInstant = {
  activeBg:     accent.primary,
  activeBorder: accent.primary,
  activeText:   accent.on,
}

/** Mode toggle — Discover button (active) */
export const modeDiscovery = {
  activeBg:     accent.dim,
  activeBorder: accent.dim,
  activeText:   accent.soft,
}
