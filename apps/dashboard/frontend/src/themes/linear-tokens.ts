/**
 * Linear Design System Tokens
 * Based on Linear.app's visual language — ultra-minimal dark-mode-first product UI
 *
 * Reference: Linear.app design system
 * Font: Inter Variable (Google Fonts CDN substitute: Geist via Google Fonts)
 *   CSS: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif
 *   Mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco
 *   OpenType features (cv01, ss03) give Inter its geometric character
 *
 * Key principles:
 * - Dark-mode-native: #08090a is the canvas, not a theme applied to light
 * - Weight 510 is the signature between-weight (not 400, not 500)
 * - Display text uses aggressive negative letter-spacing
 * - Brand accent is the ONLY chromatic color (#5e6ad2 / #7170ff)
 * - Borders are semi-transparent white, never solid dark on dark
 * - Elevation through background luminance stepping, not shadows
 */

// ─── Color Palette ──────────────────────────────────────────────────────────

export const LINEAR = {
  // Background surfaces — luminance stepping from darkest to lightest
  bg: {
    marketing: '#08090a',   // Hero/marketing pages
    panel:      '#0f1011',  // Sidebar, panels
    surface:    '#191a1b',  // Cards, elevated surfaces
    hover:      '#28282c',  // Hover states, lightest dark
  },

  // Text — three tiers of hierarchy
  text: {
    primary:     '#f7f8f8',  // Near-white, NOT pure white (prevents eye strain)
    secondary:   '#d0d6e0', // Silver-gray for body/descriptions
    tertiary:     '#8a8f98', // Muted for placeholders, metadata
    quaternary:   '#62666d', // Most subdued — timestamps, disabled
  },

  // Brand accent — the ONLY chromatic color in the system
  brand: {
    indigo:     '#5e6ad2',  // CTA backgrounds, brand marks
    violet:     '#7170ff',  // Interactive accents, links, active states
    hover:      '#828fff',  // Hover on accent elements
    muted:      '#7a7fad',  // Security/locked UI elements
  },

  // Status — green only, used sparingly
  status: {
    green:      '#27a644',  // Primary success / "in progress"
    emerald:    '#10b981',  // Pills, completion badges
    red:        '#eb4545',  // Error/danger
    amber:      '#f59e0b',  // Warning
  },

  // Borders — semi-transparent white (PRIMARY depth indicator)
  border: {
    subtle:     'rgba(255,255,255,0.05)',  // Default, whisper-thin
    standard:   'rgba(255,255,255,0.08)',  // Cards, inputs, code blocks
    tertiary:   'rgba(255,255,255,0.12)',  // Emphasized dividers
    solid:      '#23252a',                  // Solid fallback
  },

  // Buttons — translucent backgrounds, not solid
  button: {
    ghost:      'rgba(255,255,255,0.02)',  // Default ghost
    ghostHover: 'rgba(255,255,255,0.05)',  // Ghost on hover
    subtle:     'rgba(255,255,255,0.04)',  // Subtle/toolbar
    primary:    '#5e6ad2',                  // Brand CTA
    primaryHover: '#828fff',               // Brand on hover
  },

  // Overlay
  overlay: {
    primary:  'rgba(0,0,0,0.85)',  // Modal backdrop
    faint:    'rgba(0,0,0,0.50)',  // Tooltips, dropdowns
  },
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────

export const LINEAR_TYPE = {
  // Font stacks
  fontSans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",

  // OpenType features that give Inter its geometric Linear character
  fontFeatures: "'cv01', 'ss03'",

  // Weights — Linear uses 3 tiers, NOT 400/500/700
  weight: {
    light:        300,  // De-emphasized only
    regular:      400,  // Reading weight
    signature:    510,  // Linear's signature between-weight (DEFAULT emphasis)
    semibold:     590,  // Strong emphasis, max used
  },

  // Scale
  size: {
    tiny:     '0.63rem',   // 10px — overline, uppercase labels
    micro:    '0.69rem',   // 11px — tiny labels
    label:    '0.75rem',   // 12px — button text, small labels
    caption:  '0.81rem',   // 13px — metadata, timestamps
    captionL: '0.88rem',   // 14px — sub-labels
    small:    '0.94rem',   // 15px — secondary body
    body:     '1.00rem',   // 16px — standard reading
    bodyL:    '1.06rem',   // 17px — emphasized body
    bodyLL:   '1.13rem',   // 18px — introductions, feature descriptions
    h3:       '1.25rem',   // 20px — feature titles, card headers
    h2:       '1.50rem',   // 24px — sub-section headings
    h1:       '2.00rem',   // 32px — major section titles
    display:  '3.00rem',   // 48px — section headlines
    displayL: '4.00rem',   // 64px — secondary hero
    displayXL:'4.50rem',   // 72px — hero headlines
  },

  // Letter-spacing — display text compresses, body relaxes
  tracking: {
    displayXL: '-1.584px',
    displayL:  '-1.408px',
    display:   '-1.056px',
    h1:        '-0.704px',
    h2:        '-0.288px',
    h3:        '-0.240px',
    bodyL:     '-0.165px',
    small:     '-0.165px',
    captionL:  '-0.182px',
    caption:   '-0.130px',
    tiny:      '-0.150px',
    body:      'normal',
    label:     'normal',
  },

  // Line height
  leading: {
    tight:   '1.00',  // Display sizes
    snug:    '1.13',  // h1
    normal:  '1.33',  // h2, h3
    relaxed: '1.50',  // body text
    loose:   '1.60',  // body large, reading text
  },
} as const;

// ─── Spacing & Radius ──────────────────────────────────────────────────────

export const LINEAR_LAYOUT = {
  // 8px base grid, with 7px and 11px for optical adjustments
  space: {
    1:  '4px',
    2:  '8px',
    3:  '12px',
    4:  '16px',
    5:  '20px',
    6:  '24px',
    8:  '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },

  // Border radius scale
  radius: {
    micro:   '2px',    // Inline badges, toolbar buttons
    small:   '4px',    // Small containers, list items
    card:    '6px',    // Buttons, inputs, functional elements
    standard:'8px',    // Cards, dropdowns, popovers
    panel:   '12px',   // Panels, featured cards
    large:   '22px',  // Large panel elements
    pill:     '9999px', // Chips, filter pills
    circle:   '50%',   // Icon buttons, avatars
  },
} as const;

// ─── Shadows / Elevation ───────────────────────────────────────────────────
// On dark surfaces, shadows are nearly invisible.
// Linear uses semi-transparent WHITE BORDERS as primary depth indicator.
// Background luminance stepping does the rest.

export const LINEAR_ELEVATION = {
  // Primary technique: semi-transparent white borders
  // border: 1px solid rgba(255,255,255,0.05) → 0.08 → 0.12 as elevation increases

  // Secondary technique: subtle inset for recessed panels
  inset: 'rgba(0,0,0,0.20) 0px 0px 12px 0px inset',

  // Tertiary technique: multi-layer shadow stack for floating elements
  elevated: [
    'rgba(0,0,0,0) 0px 8px 2px',
    'rgba(0,0,0,0.01) 0px 5px 2px',
    'rgba(0,0,0,0.04) 0px 3px 2px',
    'rgba(0,0,0,0.07) 0px 1px 1px',
    'rgba(0,0,0,0.08) 0px 0px 1px',
  ].join(', '),

  // Focus ring
  focus: 'rgba(0,0,0,0.10) 0px 4px 12px',

  // Button shadow (toolbar buttons use this)
  button: 'rgba(0,0,0,0.03) 0px 1.2px 0px 0px',
} as const;

// ─── Utility: CSS custom properties ───────────────────────────────────────

/**
 * Returns a string of CSS custom properties to inject into a container
 * or :root. Use this for the Linear theme variant.
 */
export function linearCssVars(prefix = '--linear'): string {
  const p = prefix;
  return `
${p}-bg-marketing: ${LINEAR.bg.marketing};
${p}-bg-panel: ${LINEAR.bg.panel};
${p}-bg-surface: ${LINEAR.bg.surface};
${p}-bg-hover: ${LINEAR.bg.hover};

${p}-text-primary: ${LINEAR.text.primary};
${p}-text-secondary: ${LINEAR.text.secondary};
${p}-text-tertiary: ${LINEAR.text.tertiary};
${p}-text-quaternary: ${LINEAR.text.quaternary};

${p}-brand-indigo: ${LINEAR.brand.indigo};
${p}-brand-violet: ${LINEAR.brand.violet};
${p}-brand-hover: ${LINEAR.brand.hover};

${p}-status-green: ${LINEAR.status.green};
${p}-status-emerald: ${LINEAR.status.emerald};
${p}-status-red: ${LINEAR.status.red};
${p}-status-amber: ${LINEAR.status.amber};

${p}-border-subtle: ${LINEAR.border.subtle};
${p}-border-standard: ${LINEAR.border.standard};
${p}-border-tertiary: ${LINEAR.border.tertiary};

${p}-radius-micro: ${LINEAR_LAYOUT.radius.micro};
${p}-radius-card: ${LINEAR_LAYOUT.radius.card};
${p}-radius-standard: ${LINEAR_LAYOUT.radius.standard};
${p}-radius-panel: ${LINEAR_LAYOUT.radius.panel};
`;
}
