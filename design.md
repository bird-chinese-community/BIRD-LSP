---
name: birdcc-hover-design
description: Native editor lookup popovers with compact identity summaries and attributed evidence, in light and dark editor themes.
version: 2026-11-10
---

# 1. Scope and priority

- [MUST] Apply these rules to the native Markdown lookup popover. Preserve the editor's theme, text scaling, keyboard navigation and hover container.
- [MUST] Prioritize factual scope, readable content and safe text before decoration.
- [SHOULD] Decision: Keep this contract specific to a compact popover. Source: the requested component refactor.

# 2. Brand and readers

- [SHOULD] Decision: Use a reference-card composition for readers accustomed to technical identifiers. Give the identifier one title and group evidence below it. Source: the existing editor interface and the requested visual refactor.
- [SHOULD] Use short labels and ordinary text. Reserve emphasis for the primary answer and meaningful result states.

# 3. Structure and composition

- [SHOULD] Decision: Compose the first viewport as a title, a short identity summary, a compact result table and secondary evidence. Source: the current popover has repeated bold labels and crowded evidence lines.
- [MUST] Keep an attributed value with its scope. Put a qualifier next to the value it limits.
- [SHOULD] Put uncertain or absent values in the same visual hierarchy as their available counterparts.
- [SHOULD] Keep longer collections below the summary. State how many items are displayed when a collection is shortened.

# 4. Visual rules

- [MUST] Use host-rendered Markdown typography. Do not add HTML, custom CSS, remote fonts or fixed colors.
- [SHOULD] Decision: Use one level-three heading for the identifier. Use regular body text for names and italic text for short attribution. Source: native Markdown supports these roles without client-specific styling.
- [SHOULD] Decision: Use a two-column Markdown table for paired labels and results. Left-align both columns. Source: paired results need a shared reading edge rather than repeated labels in prose.
- [MUST] Preserve the identifier's text when wrapping. Do not insert invisible characters into copyable values.
- [MUST] Keep the popover within the native viewport. Do not hide overflow or reduce font size to conceal a layout problem.
- [SHOULD] Keep content in one column when a table would force horizontal scrolling.
- [MUST] Render status labels as text. Their meaning must remain visible without color.
- [SHOULD] Decision: Use one blank line between major groups and no blank lines inside a short identity summary. Source: the rendered native popover has a limited initial height.
- [MUST] Inherit native surfaces, borders, shadows, focus styling and reduced-motion behavior.

# 5. Available primitives

| Role              | Implementation name or value             | Source                                                                        | Usage condition                   | Status              |
| :---------------- | :--------------------------------------- | :---------------------------------------------------------------------------- | :-------------------------------- | :------------------ |
| Popover surface   | Native editor hover container            | VS Code `editorHoverWidget.background`, `.foreground`, `.border` theme colors | All lookup popovers               | Implemented by host |
| Identifier title  | Markdown `###`                           | `packages/@birdcc/lsp/src/dn42-hover.ts`                                      | One primary identifier            | Implemented         |
| Identity summary  | Markdown paragraph with hard line breaks | Same renderer                                                                 | Short related values              | Implemented         |
| Primary answer    | Markdown strong text                     | Same renderer                                                                 | One main answer per group         | Implemented         |
| Attribution       | Markdown emphasis                        | Same renderer                                                                 | Source and uncertainty qualifiers | Implemented         |
| Result table      | Left-aligned two-column Markdown table   | Same renderer                                                                 | Paired label/value results        | Implemented         |
| Detail collection | Markdown list                            | Same renderer                                                                 | Attributed member samples         | Implemented         |

- [MUST] Use only the Markdown primitives listed here. Render arbitrary source strings as escaped text inside them.
- [MUST] Keep the style namespace owned by the host. This component has no custom style namespace and cannot override the host's primitives.

# 6. Copy and number formats

- [MUST] Keep technical identifiers intact and source qualifiers explicit.
- [SHOULD] Use sentence case for labels. Keep standardized abbreviations in their established case.
- [MUST] Show missing, inconclusive and conflicting values with different words when they describe different states.
- [SHOULD] Use an integer count followed by a noun for collections. Use a short remaining-item count for shortened collections.

# 7. Anti-patterns

- [SHOULD] Do not use a centered title with a decorative card grid.
- [SHOULD] Do not place cards inside the native popover surface.
- [SHOULD] Do not add decorative icon tiles or colored icon backgrounds.
- [SHOULD] Do not add font sizes, weights or color literals outside the host primitives.
- [SHOULD] Do not render primary information as small, low-contrast text.
- [SHOULD] Do not use code-span pills for ordinary metadata or long service descriptions.
- [SHOULD] Do not give every metadata label the same emphasis as the primary identifier.

# 8. Implementation and integration

- [MUST] Keep the presentation in `packages/@birdcc/lsp/src/dn42-hover.ts` and return standard Markdown to the host.
- [MUST] Let the editor load fonts and select the theme. The popover imports no presentation assets.

## Glossary

| Name              | Meaning                                            |
| :---------------- | :------------------------------------------------- |
| Identity summary  | A short paragraph immediately below the title      |
| Result table      | A two-column set of attributed label/value results |
| Detail collection | A shortened list with its original item scopes     |
