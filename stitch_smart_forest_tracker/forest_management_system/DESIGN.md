---
name: Forest Management System
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf1'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fa'
  on-surface: '#111c2c'
  on-surface-variant: '#424844'
  inverse-surface: '#263142'
  inverse-on-surface: '#ebf1ff'
  outline: '#727973'
  outline-variant: '#c2c8c2'
  surface-tint: '#496455'
  primary: '#173124'
  on-primary: '#ffffff'
  primary-container: '#2d4739'
  on-primary-container: '#98b5a3'
  inverse-primary: '#b0cdbb'
  secondary: '#765840'
  on-secondary: '#ffffff'
  secondary-container: '#fed5b6'
  on-secondary-container: '#795b42'
  tertiary: '#4f1c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#722c00'
  on-tertiary-container: '#ff9159'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ccead6'
  primary-fixed-dim: '#b0cdbb'
  on-primary-fixed: '#062014'
  on-primary-fixed-variant: '#324c3e'
  secondary-fixed: '#ffdcc1'
  secondary-fixed-dim: '#e6bfa1'
  on-secondary-fixed: '#2b1704'
  on-secondary-fixed-variant: '#5c412a'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb693'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7a3000'
  background: '#f9f9ff'
  on-background: '#111c2c'
  surface-variant: '#d8e3fa'
typography:
  headline-lg:
    fontFamily: Public Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  margin-main: 1.25rem
  gutter-grid: 1rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 1.5rem
  touch-target: 3rem
---

## Brand & Style

The brand personality of this design system is authoritative, utilitarian, and resilient. It is designed for professionals who manage natural resources, balancing environmental stewardship with industrial precision. The UI must feel like a high-quality field tool—reliable under pressure and intuitive in high-glare outdoor environments.

The design style follows a **Corporate/Modern** approach with **Tactile** influences. It prioritizes clarity and functional density over decorative flourishes. By using a grounded color palette and robust structural elements, the design system evokes a sense of stability and institutional trust, ensuring users feel confident making critical decisions in the field.

## Colors

The color palette is derived from the forest floor and professional safety gear. The primary **Forest Green** serves as the anchor, representing the environment and providing a calm, professional base. **Earthy Brown** is used for secondary structural elements and categorizing organic data.

For high-priority interactions and safety-critical information, a **Safety Orange** is utilized. This high-visibility accent ensures that alerts and primary Call-to-Actions (CTAs) remain legible even in bright sunlight. The neutral scale uses **Slate Greys** instead of pure blacks to reduce visual fatigue, while backgrounds utilize a slightly warm "Bone" off-white (#F7F9F7) to minimize glare during field use.

## Typography

This design system utilizes **Public Sans** across all levels. Chosen for its institutional clarity and roots in government accessibility standards, it offers exceptional legibility in outdoor conditions. 

Headlines are set with tighter tracking and heavier weights to maintain hierarchy on small mobile screens. Body text uses a generous line height to ensure readability while walking or in motion. Labels and status indicators utilize uppercase styling and increased letter spacing to distinguish metadata from actionable content. High contrast between text and background is strictly maintained to pass WCAG AA standards for outdoor use.

## Layout & Spacing

This design system employs a **Fluid Grid** model optimized for mobile devices. The layout is built on a 4-column system with 20px (1.25rem) side margins to prevent content from being obscured by rugged phone cases.

The spacing rhythm follows an 8px base unit. Vertical stack spacing is prioritized to create clear groupings of data points. To accommodate use with gloves or in shaky environments, the minimum touch target for interactive elements is strictly set to 48px (3rem). Density is moderately high to allow foresters to view comprehensive data sets without excessive scrolling, but information is strictly compartmentalized using generous gutters.

## Elevation & Depth

To maintain a "grounded" feel, this design system avoids heavy shadows or floating elements. Instead, it uses **Tonal Layers** and **Low-Contrast Outlines**.

Depth is communicated through "Layered Surfaces":
1.  **Base Level:** The canvas, using the lightest neutral tint.
2.  **Surface Level:** Cards and containers, using pure white with a 1px Slate Grey border (#E2E8F0).
3.  **Raised Level:** Active states or modals, which use a subtle, tight ambient shadow (4px blur, 10% opacity) to suggest a physical lift from the background.

This approach ensures the UI feels like a single, cohesive unit rather than a series of disconnected floating parts, reinforcing the theme of reliability and physical presence.

## Shapes

The shape language is **Soft (Level 1)**. Elements feature a 4px (0.25rem) corner radius, striking a balance between the precision of a professional tool and the organic nature of the forest. 

Standard components like input fields and buttons use the base 4px radius. Larger containers, such as data cards, may scale up to 8px (0.5rem) to provide a softer visual framing for complex information. Status badges and map markers utilize a "squircle" or semi-rounded profile to distinguish them from structural layout elements.

## Components

### Buttons & Inputs
Primary buttons use a solid **Safety Orange** fill with white text for maximum visibility. Secondary buttons use a **Forest Green** outline. Input fields feature a thick 2px bottom border when focused to provide a clear visual cue in high-glare environments.

### Map Markers
Markers are designed as high-contrast teardrops. They utilize the primary palette to indicate feature types (e.g., Green for healthy timber, Brown for cleared areas). An inner white glyph ensures the marker's purpose is identifiable at a glance.

### Status Badges
Badges use a semi-bold label font and are color-coded by urgency:
- **Critical:** Safety Orange background, White text.
- **Stable:** Forest Green background, White text.
- **Monitoring:** Earthy Brown background, White text.

### Data Cards
Documentation forms and data cards use a "header-strip" style where a 4px vertical bar on the left edge indicates the status or category of the entry, allowing users to scan long lists of forest data quickly.

### Specialized Elements
The design system includes high-contrast **Compass Overlays** and **Coordinate Labels** that remain pinned to the bottom of the viewport during navigation, using a semi-opaque Slate Grey background for legibility over moving map tiles.