---
name: Entourage
description: A typesetter's galley for the Entourage event platform.
colors:
  accent: "#0f5c4c"
  accent-hover: "#0c4a3d"
  accent-foreground: "#f4fbf8"
  accent-soft: "#e3f2ed"
  dark-accent: "#3dbea2"
  dark-accent-hover: "#62d0b8"
  dark-accent-foreground: "#04241c"
  dark-accent-soft: "#17352e"
  background: "#f3f3f1"
  surface: "#fcfcfb"
  sidebar: "#e9e9e6"
  foreground: "#1c1c1a"
  muted: "#5c5c56"
  border: "#dddcd7"
  hover: "#e6e6e2"
  selected: "#deded8"
  disabled: "#ecebe7"
  overlay: "rgb(22 22 20 / 48%)"
  dark-background: "#121310"
  dark-surface: "#1c1d1a"
  dark-sidebar: "#181914"
  dark-foreground: "#f4f4f1"
  dark-muted: "#b7b7ae"
  dark-border: "#31322d"
  dark-hover: "#262722"
  dark-selected: "#2d2e29"
  dark-disabled: "#242520"
  dark-overlay: "rgb(0 0 0 / 62%)"
  danger: "#8d2f2f"
  danger-hover: "#742626"
  danger-foreground: "#fff7f7"
  danger-soft: "#f7e8e8"
  dark-danger: "#f0b4b4"
  dark-danger-hover: "#f7cdcd"
  dark-danger-foreground: "#2a1010"
  dark-danger-soft: "#3c2222"
typography:
  display:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4286
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4286
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-foreground}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.foreground}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.danger-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
    textColor: "{colors.danger-foreground}"
  button-disabled:
    backgroundColor: "{colors.disabled}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    height: "36px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  nav-item:
    textColor: "{colors.muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  status-draft:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "24px"
  status-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "24px"
  status-archived:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "24px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "20px"
    width: "min(28rem, calc(100vw - 2rem))"
  specification-row:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "12px 0"
  tally-count:
    textColor: "{colors.foreground}"
    typography: "{typography.display}"
    padding: "20px 16px"
  wordmark:
    textColor: "{colors.foreground}"
---

# Design System: Entourage

## Overview

**Creative North Star: "The Typesetter's Galley"**

Entourage is a typesetter's galley for an event platform. The page is warm paper. Work sits on a slightly lighter sheet, separated by hairline rules, set in charcoal ink. One spruce accent is reserved for the primary action, the keyboard focus ring, the text caret, the selection wash, and the Active status stamp. Light and dark are the same structure: paper, sheet, rule, and ink stay apart in both themes.

Density is that of a desk tool. Page titles are one size. Body and labels share a single grotesque. Dates in tables and counts in the tally use tabular figures. Corners are 6px, with 4px only where a control sits inside a 6px track. Shadows appear on overlays — dialogs, menus, and toasts — and nowhere on the resting page.

The signed-in shell is a 248px sidebar and one content column. Lists are full-width tables. An opened event is a ruled specification, with unbuilt modules left in the rail as muted, non-interactive labels.

**Key Characteristics:**

- Stepped warm-neutral ramp, with paper, sheet, rule, and ink kept apart in both themes
- One spruce accent, plus a danger ramp kept for destructive actions and errors
- Geist Sans at 400, 500, and 600, with tabular figures on table dates and tally counts
- 6px corners, 4px inset segments, and shadow only on overlays
- A 248px sidebar and ruled specifications, not a card grid

## Colors

A warm neutral galley, one spruce accent, and a danger ramp that never substitutes for that accent. Light values are the `:root` tokens. Each `dark-*` token is the same role under `.dark`. The focus ring uses the accent in both themes (`--ring` matches it), so it has no separate swatch.

### Primary

- **Spruce** (#0f5c4c): Light-theme primary button, focus ring, and text caret. **Night Spruce** (#3dbea2) is the same role on the dark ground.
- **Spruce Deep** (#0c4a3d): Hover on the light primary button. Dark hover lightens instead, to **Night Spruce Lift** (#62d0b8).
- **Spruce Paper** (#f4fbf8): Text on the light spruce fill. Text on the dark spruce fill is **Night Spruce Ink** (#04241c).
- **Spruce Wash** (#e3f2ed): Active status stamp and text selection in light. The dark wash is **Night Spruce Wash** (#17352e). Selection text stays ink.

### Neutral

- **Warm Paper** (#f3f3f1) / **Night Paper** (#121310): Page ground.
- **Sheet** (#fcfcfb) / **Night Sheet** (#1c1d1a): Fields, menus, dialogs, toasts, and the skip link.
- **Galley** (#e9e9e6) / **Night Galley** (#181914): Sidebar slab, one step off the page.
- **Charcoal Ink** (#1c1c1a) / **Night Ink** (#f4f4f1): Primary text.
- **Proof Gray** (#5c5c56) / **Night Proof** (#b7b7ae): Ledes, placeholders, inactive nav, table dates.
- **Rule** (#dddcd7) / **Night Rule** (#31322d): Hairlines, control borders, and dividers.
- **Press** (#e6e6e2) / **Night Press** (#262722): Hover on rows, nav, secondary buttons, and the skeleton fill.
- **Selected Sheet** (#deded8) / **Night Selected** (#2d2e29): Active nav, selected filter, Draft stamp, and the initials tile.
- **Rest** (#ecebe7) / **Night Rest** (#242520): Disabled control fill.
- **Scrim** (`rgb(22 22 20 / 48%)`) / **Night Scrim** (`rgb(0 0 0 / 62%)`): Veil behind the mobile drawer and modal dialogs.

### Named Rules

**The Spruce Rule.** Spruce marks the primary action, the focus ring, the caret, the selection wash, and the Active stamp. It does not color navigation, tally numbers, or structure.

**The Separate Inks Rule.** Paper, sheet, rule, and ink are four different steps in both themes.

**The Seal Rule.** Destructive confirmation, invalid field borders, and error text use the danger ramp: Seal (#8d2f2f), Seal Deep (#742626), Seal Paper (#fff7f7), and Seal Wash (#f7e8e8) in light; Night Seal (#f0b4b4), Night Seal Lift (#f7cdcd), Night Seal Ink (#2a1010), and Night Seal Wash (#3c2222) in dark. Light seal deepens on hover. Dark seal lightens. This ramp is not a brand accent.

## Typography

**Display Font:** Geist Sans (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Geist Sans (same stack)
**Label/Mono Font:** Geist Sans. There is no monospace. Tabular numerals are a feature of this face, applied where numbers align.

**Character:** One grotesque, loaded at 400, 500, and 600. Page titles tighten slightly. The wordmark is the only widely tracked setting.

### Hierarchy

- **Display** (600, 1.75rem, line-height 1.5, tracking -0.02em): Page titles and tally counts. Counts add tabular numerals. The title size does not set its own line-height, so it inherits the root line-height (1.5).
- **Title** (600, 1rem, line-height 1.5): Section headings in the dashboard and settings, such as "Recent events". Inside an opened event, a specification group label is label weight at body size (500, 0.875rem), not this title size.
- **Body** (400, 0.875rem, line-height 1.4286): Table cells, field values, ledes, and descriptions. A page lede sits 8px under the title in Proof Gray.
- **Label** (500, 0.875rem, line-height 1.4286): Form labels, buttons, table headers, and the active nav item. Stamps, the signed-in role, and the wordmark's second line are 0.75rem. The wordmark name is 13px, weight 600, tracking 0.16em, and is not a style for other labels.

### Named Rules

**The One Grotesque Rule.** Geist Sans carries every label, title, and count. The loaded weights are 400, 500, and 600.

**The Tabular Figures Rule.** Table dates and tally counts use tabular numerals.

**The Wordmark Tracking Rule.** Letter-spacing of 0.16em belongs to the ENTOURAGE wordmark. Page titles and counts use -0.02em. All other text stays at normal tracking.

## Layout

The signed-in frame is a full-viewport row. The sidebar is 248px, full height, with a right-hand rule. The header is 56px with a bottom rule. The content column scrolls on its own, centers a measure of 72rem, and pads 32px vertically. Horizontal padding is 16px, 24px from 640px, and 32px from 1024px. Below 768px the sidebar leaves the row and returns as a 248px drawer over the scrim.

Forms and specifications narrow to 48rem. The event form itself is 36rem, with fields stacked 20px apart and the date pair splitting into two columns from 640px. Sign-in sits in a 380px column, centered, with 24px of side padding and 64px of vertical padding. Specification labels occupy a 180px column from 640px and stack above the value below that. Tables scroll horizontally inside a 720px minimum.

The spacing rhythm that repeats is 4, 8, 12, 16, 20, 24, 32, and 40px. Nav items pad 10px horizontally. A field label sits 6px above its control.

**The Galley Rule.** The signed-in frame is a fixed 248px sidebar and a single column capped at 72rem. Below 768px the sidebar becomes an overlay drawer.

## Elevation & Depth

Resting surfaces are flat. Paper, sheet, galley, and a 1px rule make the steps. The only shadow is the overlay shadow on dialogs, menus, and toasts. The mobile drawer darkens the page with the scrim and does not cast that shadow. Skeleton placeholders are the press fill with a pulse, in a 6px corner.

State changes recolor in 150ms. Buttons use ease-out; nav and rows use the same 150ms with the default ease. The page fades in over 160ms from opacity 0.72. The drawer travels over 200ms ease-out. When reduced motion is requested, animation and transition durations collapse to 0.01ms.

### Shadow Vocabulary

- **Overlay, light** (`box-shadow: 0 1px 2px rgb(22 22 20 / 6%), 0 12px 28px rgb(22 22 20 / 8%)`): Dialogs, menus, and toasts on Warm Paper.
- **Overlay, dark** (`box-shadow: 0 1px 2px rgb(0 0 0 / 35%), 0 16px 36px rgb(0 0 0 / 40%)`): The same overlays on Night Paper.

### Named Rules

**The Overlay Shadow Rule.** The shadow token is for dialogs, menus, and toasts. Resting pages, tables, the sidebar, and specification rows are flat.

## Shapes

Corners are a short, even curve. The system radius is 6px, on buttons, fields, stamps, dialogs, menus, choice rows, the initials tile, and the skeleton. A segment nested in a 6px track — a menu item, or a status filter — uses 4px so the inner corner sits inside the outer one. The filter track's padding is 2px. Nothing is a pill, and nothing is square-cut.

**The Six Pixel Rule.** Controls, stamps, dialogs, menus, and choice rows use a 6px corner. Segments nested inside a 6px track use 4px.

## Components

### Buttons

Quiet, one line tall, sentence case.

- **Shape:** 6px corner (6px), 36px tall, 12px horizontal padding, 8px between label and a trailing mark, label weight.
- **Primary:** Spruce fill, Spruce Paper text. In dark, Night Spruce and Night Spruce Ink. Hover deepens in light and lightens in dark, over 150ms ease-out.
- **Hover / Focus:** Focus is a 2px spruce outline, 2px outside the control. Disabled replaces any fill with Rest and any label with Proof Gray, and sets the not-allowed cursor.
- **Secondary:** Sheet fill, 1px rule, ink text. Hover fills with Press. This is the cancel, retry, and "Edit event" action.
- **Danger:** Seal fill and Seal Paper text, used for the confirming action in a dialog. A full-width sign-in submit keeps the primary colors and grows to 40px tall.

### Chips

Status is a 24px stamp, 6px corner, 8px horizontal padding, 0.75rem medium.

- **Draft:** Selected Sheet fill, ink text.
- **Active:** Spruce Wash fill, Spruce text. This is the only stamp that uses the accent.
- **Archived:** No fill, 1px rule, Proof Gray text.
- **Filters:** A 6px track with a 1px rule and 2px padding. Each segment is 32px tall, 4px corner, 12px horizontal padding. The selected segment is Selected Sheet, medium, ink. The rest are Proof Gray.

### Inputs / Fields

- **Style:** Sheet fill, 1px rule, 6px corner, 40px tall, 12px horizontal padding, body type. The label is label weight, 6px above the control. Placeholder and hint are Proof Gray. A toolbar search uses the same stroke at the button height (36px). Textareas share the stroke, pad 8px vertically, and start at a minimum height of 7rem.
- **Focus:** The global 2px spruce outline at 2px offset. The caret is spruce.
- **Error / Disabled:** Invalid fields take a Seal border and a Seal message in body size. A form-level error is Seal text on Seal Wash, 6px corner, 8px by 12px padding. Disabled fields fill with Rest.

### Navigation

The sidebar is the galley slab. The wordmark sits in 16px by 20px of padding. Items are 36px tall, 10px horizontal padding, 6px corner, body size, Proof Gray. Hover fills with Press and turns the label to ink. The active item is Selected Sheet, label weight, ink. Groups are separated by a 1px rule. The event rail is a bottom rule of tabs: the current tab is ink with a 1px ink underline; other built tabs are Proof Gray. An unbuilt module stays in the rail, at least 144px wide, muted, not a link, with the module name and the line "Not built yet" at 0.75rem.

The signed-in person is a 32px initials tile (Selected Sheet, 6px corner, 0.75rem medium) with the name at label weight and the role in Proof Gray at 0.75rem. Header controls are 36px squares, Proof Gray, Press on hover. Below 768px, a header button opens the sidebar as a drawer. Breadcrumbs are body size; ancestors are Proof Gray, and the current crumb is medium ink.

Choice rows, as on the theme setting, are full-width 6px boxes with a 1px rule and 12px padding. The chosen row's rule becomes ink. The radio itself uses spruce.

### Specification

An opened event reads as a ruled job. A group label at label weight sits above a list whose first and last edges are rules. Each row pads 12px vertically, stacks on small screens, and from 640px becomes a 180px label plus the value, with 24px between them. The label is Proof Gray. The value is body ink. Status in that list is the stamp, not a word alone.

### Tally

Counts on the overview are one strip: three columns, rules on the top and bottom, vertical rules between, 20px vertical padding, 4px of side padding growing to 16px from 640px. The label is body, Proof Gray. The figure is the display size with tabular numerals.

### Event table

Full width, at least 720px, body size, left aligned. Header cells are Proof Gray, label weight, 10px vertical padding, with a bottom rule. Body rows pad 12px vertically, keep a bottom rule, and fill with Press on hover over 150ms. Dates are Proof Gray with tabular numerals. The event name is medium ink.

### Wordmark

The lockup is a 28px ruled-square mark, then ENTOURAGE at 13px semibold with 0.16em tracking, then "Event Platform" at 0.75rem in Proof Gray. The mark and the name are ink. Its focus outline uses a 4px offset; every other focus ring uses 2px.

### Dialogs and menus

Dialogs are sheet, 1px rule, 6px corner, the overlay shadow, and 20px padding, capped at 28rem. The title is the title size. The description is body, Proof Gray, 8px below. Actions sit at the trailing edge, 8px apart, 20px below the copy: secondary, then danger. The backdrop is the scrim. Menus are the same sheet, rule, shadow, and 6px corner, with 4px padding, at least 11rem wide, 6px off the trigger. Items are 4px corner, 10px by 6px padding, and fill with Press when highlighted.

## Do's and Don'ts

### Do:

- **Do** keep spruce on the primary action, the 2px focus ring at 2px offset, the caret, the selection wash, and the Active stamp.
- **Do** divide tally counts and specification rows with a 1px rule.
- **Do** set tabular numerals on table dates and tally counts.
- **Do** leave unbuilt event modules in the rail, muted and not links, with the line "Not built yet".
- **Do** collapse motion when reduced motion is requested. Color transitions are 150ms, the page fade is 160ms from opacity 0.72 to 1, and the mobile drawer is 200ms.

### Don't:

- **Don't** structure a page as a card grid or as icon-and-number tiles.
- **Don't** put the overlay shadow on a resting surface.
- **Don't** introduce a second brand hue. Destructive actions and field errors use the danger ramp only.
- **Don't** add a second type family or apply the wordmark's 0.16em tracking to any other text.
- **Don't** use gradients, glass, neon, or decorative motion.
