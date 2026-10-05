---
name: Obsidian Ledger
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#38393a'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c4c7c7'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c8c6c5'
  primary: '#c8c6c5'
  on-primary: '#313030'
  primary-container: '#121212'
  on-primary-container: '#7e7d7d'
  inverse-primary: '#5f5e5e'
  secondary: '#b6c4ff'
  on-secondary: '#00277e'
  secondary-container: '#1c40a5'
  on-secondary-container: '#a2b5ff'
  tertiary: '#c8c6c6'
  on-tertiary: '#303030'
  tertiary-container: '#121212'
  on-tertiary-container: '#7e7d7d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#dce1ff'
  secondary-fixed-dim: '#b6c4ff'
  on-secondary-fixed: '#00164f'
  on-secondary-fixed-variant: '#183ea2'
  tertiary-fixed: '#e4e2e1'
  tertiary-fixed-dim: '#c8c6c6'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474747'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 24px
  margin: 32px
  max_width: 1200px
---

## Brand & Style
The design system is built for the focused professional—engineers, researchers, and administrators who require a digital equivalent of a high-quality field notebook. The personality is quiet, utilitarian, and intellectually serious. It prioritizes the "Daily Work Ledger" as a place of record, moving away from ephemeral social interfaces toward a permanent, archival feel.

The visual style is **Minimalist-Technocratic**. It rejects shadows, gradients, and decorative flourishes in favor of structural clarity, thin borders, and precise alignment. It draws inspiration from Swiss international style and engineering documentation, emphasizing content over container. The emotional response should be one of "calm productivity" and "unwavering reliability."

## Colors
The palette is a mathematically harmonious dark theme designed for long-duration focus and reduced eye strain. 
- **Primary Surfaces:** A deep charcoal (#121212) serves as the base, with a slightly elevated slate (#1E1E1E) for containers.
- **Typography:** Text uses an off-white (#E0E0E0) to maintain high contrast (WCAG 2.2 AA) without the harshness of pure white on black.
- **Accents:** A muted indigo (#5E7CE2) is used sparingly for primary actions and focus states. A secondary teal (#4DB6AC) is reserved for success indicators or specific "starred" highlights.
- **Borders:** All structural separation is handled via thin #333333 borders rather than shadows.

## Typography
This design system employs a dual-font strategy to distinguish between UI and Data:
- **UI & Navigation:** Uses **Inter**. It is utilitarian, neutral, and highly legible at small sizes.
- **The Ledger (Entries):** Uses **Source Serif 4**. This provides the "field notebook" feel, making long-form entries comfortable to read and giving them a sense of permanence and authority.
- **Technical Metadata:** Uses **JetBrains Mono** for timestamps, tags, and status labels to evoke a precise, logged-data aesthetic.

Hierarchy is strictly enforced through weight and spacing. Body text uses a generous line height (1.5x) to ensure the ledger remains readable even when information density is high.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy to mimic the physical constraints of a ledger or notebook. 
- **Desktop:** A centered 12-column layout with a maximum width of 1200px. Content is contained within a "sheet" defined by thin borders.
- **Density:** Information density is high. Vertical rhythm is based on a 4px baseline grid.
- **Responsive:** On mobile, margins reduce to 16px, and the 12-column grid collapses to a single-column stack. 
- **The "Margin" Column:** A dedicated narrow left column is reserved for metadata (timestamps, icons, or status) to keep the primary text aligned and clean.

## Elevation & Depth
Depth is created through **Tonal Layering** and **Line Work** rather than shadows.
- **Base Level (0):** The primary background (#121212).
- **Surface Level (1):** Containers and input areas use #1E1E1E.
- **Separation:** 1px solid lines (#333333) are the primary tool for defining boundaries.
- **Focus:** No "glow" effects. Interactive focus is indicated by a sharp 2px solid border in the primary accent color (#5E7CE2).
- **Interaction:** Hover states involve a subtle lightening of the surface color (e.g., to #252525) rather than a vertical lift.

## Shapes
To maintain the professional, utilitarian aesthetic, shapes are kept "Soft" but nearly sharp. 
- **Standard Radius:** 4px (0.25rem) for cards and buttons.
- **Inputs:** 4px radius to feel structured and architectural.
- **Exceptions:** Pill shapes are strictly forbidden, except for status indicators (chips) where a 100px radius may be used to differentiate them from functional buttons.

## Components
- **Buttons:** Ghost-style by default with a 1px border. Primary buttons use a solid #5E7CE2 fill with dark text. No rounded corners beyond 4px.
- **Input Fields:** Background #1E1E1E with a bottom-only 1px border that transforms to a full 1px box on focus. Use monospaced font for data entry.
- **Tag Chips:** Small, monospaced text, rectangular with 2px radius. Background #2D2D2D, text #E0E0E0. No icons unless necessary for status.
- **Ledger Entries:** A combined component featuring a left-aligned timestamp (mono), a central body (serif), and a right-aligned tag/action cluster. Separated by subtle horizontal rules.
- **Starred Indicators:** A small, solid teal (#4DB6AC) vertical bar on the extreme left of an entry to signify importance.
- **Document Output:** A "Print/Review" mode that strips all UI chrome, switches backgrounds to white, and text to black, maximizing the serif typography for physical readability.