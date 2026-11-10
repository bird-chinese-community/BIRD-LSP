---
name: birdcc-hover-design
description: Native editor lookup popovers with compact answer paragraphs, marked status spans and scoped evidence, in light and dark editor themes.
version: 2026-11-10
---

# 1. Scope and priority

- [MUST] Apply these rules to the native Markdown lookup popover. Preserve the editor's theme, text scaling, keyboard navigation and hover container.
- [MUST] Prioritize factual scope, readable content and safe text before decoration.
- [SHOULD] Decision: Keep this contract specific to a compact popover. Source: the requested component refactor.

# 2. Brand and readers

- [SHOULD] Decision: Use a compact reference composition for readers accustomed to technical identifiers. Separate the answer from supporting evidence through group spacing and one divider. Source: the requested hover redesign and the native editor surface.
- [SHOULD] Use short labels and ordinary text. Reserve emphasis for the primary answer and meaningful result states.

# 3. Structure and composition

- [SHOULD] Decision: Compose the first viewport as an identifier title, a compact answer paragraph and a status strip. Put the main answer before its identity context. Place secondary evidence after one divider, ending with attribution. Source: the requested compact hover and the limited native container height.
- [MUST] Keep an attributed value with its scope. Put a qualifier next to the value it limits.
- [MUST] Put a shared source qualifier in the same group as the results it qualifies. Keep broader dataset attribution in the secondary group.
- [SHOULD] Put uncertain or absent values in the same visual hierarchy as their available counterparts.
- [SHOULD] Keep longer collections below the summary. State how many items are displayed when a collection is shortened.
- [SHOULD] Decision: Place exceptional observations immediately after status lines and before the secondary divider. Source: readers must see conflicting evidence while assessing the main answer.

# 4. Visual rules

- [MUST] Use host-rendered Markdown typography. Do not add HTML, custom CSS, remote fonts or fixed colors.
- [SHOULD] Decision: Use one level-three heading for the identifier. Use regular body text for names and italic text for short attribution. Source: native Markdown supports these roles without client-specific styling.
- [SHOULD] Decision: Keep the answer and identity context in one paragraph with hard line breaks. Keep a source qualifier beside the answer it limits. Source: the native hover has limited height, and paragraph margins consume the same space as content.
- [SHOULD] Decision: Render short categorical results as native inline-code spans after regular-weight labels. Use a text marker inside the span to distinguish positive, uncertain and exceptional results. Source: the requested visual differentiation and the host's native inline-code primitive.
- [SHOULD] Decision: Put paired results on one line when they share a scope, then put that scope on the next line. Give results with different scopes their own lines. Source: repeated scope text competes with the result values in a compact hover.
- [MUST] Preserve the identifier's text when wrapping. Do not insert invisible characters into copyable values.
- [MUST] Keep the popover within the native viewport. Do not hide overflow or reduce font size to conceal a layout problem.
- [SHOULD] Keep all content in one column and allow ordinary text to wrap at the native container width.
- [MUST] Render status labels as text. Their meaning must remain visible without color.
- [MUST] Keep a full status word beside each marker. Render unrecognized external statuses as escaped body text.
- [SHOULD] Decision: Prefix an explicitly sourced location answer with the text glyph `⌖`. Keep the source qualifier beside the answer. Source: a single position marker distinguishes the location answer within the host's monochrome typography.
- [SHOULD] Decision: Use one blank line between major groups and no blank lines inside an answer paragraph. Source: the rendered native popover has a limited initial height.
- [MUST] Inherit native surfaces, borders, shadows, focus styling and reduced-motion behavior.

# 5. Available primitives

| Role              | Implementation name or value               | Source                                                                        | Usage condition                     | Status              |
| :---------------- | :----------------------------------------- | :---------------------------------------------------------------------------- | :---------------------------------- | :------------------ |
| Popover surface   | Native editor hover container              | VS Code `editorHoverWidget.background`, `.foreground`, `.border` theme colors | All lookup popovers                 | Implemented by host |
| Identifier title  | Markdown `###`                             | `packages/@birdcc/lsp/src/dn42-hover.ts`                                      | One primary identifier              | Implemented         |
| Primary answer    | Markdown strong text                       | Same renderer                                                                 | One main answer per group           | Implemented         |
| Attribution       | Markdown emphasis                          | Same renderer                                                                 | Source and uncertainty qualifiers   | Implemented         |
| Answer paragraph  | Markdown paragraph with hard line breaks   | Same renderer                                                                 | Primary answer and identity context | Implemented         |
| Status strip      | Body labels and Markdown inline-code spans | `statusBadge` in the same renderer                                            | Short categorical results           | Implemented         |
| Status marker     | `✓`, `?`, `!`, `↳` inside a status span    | `statusMarks` in the same renderer                                            | Results with a defined marker       | Implemented         |
| Position marker   | Unicode text `⌖`                           | Same renderer                                                                 | Explicitly sourced location answers | Implemented         |
| Evidence divider  | Markdown thematic break `---`              | Same renderer                                                                 | Before secondary evidence           | Implemented         |
| Detail collection | Markdown list                              | Same renderer                                                                 | Attributed member samples           | Implemented         |

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

| Name              | Meaning                                              |
| :---------------- | :--------------------------------------------------- |
| Answer paragraph  | The compact group containing the answer and context  |
| Status strip      | Paired results with marked native inline-code spans  |
| Status marker     | A character that reinforces the adjacent status word |
| Position marker   | A character attached to a sourced location answer    |
| Evidence divider  | The native rule before supplementary details         |
| Detail collection | A shortened list with its original item scopes       |
