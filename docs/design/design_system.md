# Design system

Everything is defined once in `web/src/styles.css` as CSS variables and used through a few shared components. That keeps every screen consistent.

## Colours

| Token | Hex | Used for |
|---|---|---|
| `--brand` | `#4f46e5` (indigo) | primary buttons, active tab and nav, links, "In progress" |
| `--accent` | `#0d9488` (teal) | money in, success, completed, chart highlights |
| `--danger` | `#dc2626` (red) | money out, errors, "busy" |
| `--warn` | `#b45309` (amber) | "Funded" status |
| `--text` / `--muted` | `#111827` / `#6b7280` | body text / secondary text |
| `--bg` / `--card` / `--border` | `#f6f7fb` / `#fff` / `#e5e7eb` | page, cards, dividers |

Status colours mean the same thing everywhere: **amber = funded, indigo = in progress, teal = completed**.

## Type

- Font: **Inter** (with the system fallback), 14px body.
- Sizes: page title 22px, card title 16px, stat value 22px bold.
- Labels on stats and table headers are small uppercase grey text.
- Money is always `₹` with Indian digit grouping, right-aligned, using tabular numbers.

## Components (`web/src/components/`)

| Component | What it is |
|---|---|
| `Button` | Variants: `primary`, `secondary`, `danger`; plus a `sm` size |
| `Card` | White panel with an optional title and actions |
| `Stat` | KPI tile: label, big value, hint |
| `StatusBadge` / `Badge` | Coloured pill |
| `Alert` | Success, error or info message box |
| `Field` | Label + input + hint |
| `Tabs` | Underlined tab bar |
| `DataTable` + `Pagination` | Every list in the app uses these |
| `EntityPicker` | Search-as-you-type picker for clients and freelancers (used by "Acting as", Fund Gig, Audit, Analytics, Reviews) |
| `Loading` / `Empty` / `ErrorState` / `AsyncView` | Every screen shows a spinner, a friendly empty message, or an error with *Try again*. Never a blank page. |
| `PortfolioView` | Renders a flexible Mongo document; optional sections only appear when the field exists |

## Layout

- Maximum width 1200px.
- Grids collapse from 4 or 3 columns, to 2 columns below 860px, to 1 column below 560px (phone).
- Tables scroll sideways on small screens.
- The top bar is sticky, and the nav scrolls horizontally on phones.
