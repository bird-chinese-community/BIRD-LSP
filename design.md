---
name: birdcc-hover-design
description: Editor lookup popovers that present an identifier with a property sheet of attributed results, in light, dark and high-contrast editor themes, for HTML-capable and Markdown-only LSP clients.
version: 2026-11-10
---

# 1. Scope and priority

- [MUST] Apply these rules to lookup popovers that the language server returns for identifiers. Preserve the host's popover container, font, text scaling, keyboard navigation and scrolling.
- [MUST] Resolve conflicts in this order: factual scope and safe text, contrast and readability without color, the reader's first answer, host conventions, decoration.
- [SHOULD] Decision: Render two forms of one layout. Clients that declare `span` and `table` in `general.markdown.allowedTags` receive the HTML form. Other clients receive the Markdown form. Source: LSP 3.17 markdown client capability; VS Code sends the tags when the client sets `markdown.supportHtml`.

# 2. Brand and readers

- [SHOULD] Readers scan network identifiers while editing. The popover answers who owns the identifier and whether its registry policy holds before it shows supporting evidence.
- [SHOULD] Use short sentence-case labels and plain values. Put emphasis only on the identifier title and on result icons.

# 3. Structure and composition

- [SHOULD] Decision: Compose every popover as a title, a summary, a property sheet, one divider and an attribution line. Source: the redesign request for a calmer, aligned reference layout.
- [SHOULD] The title carries one kind icon and the identifier. The summary holds the owner name and categorical role badges.
- [SHOULD] The property sheet has a label column and a value column. Each row holds one fact. A row with several values continues on following rows with an empty label cell.
- [MUST] Keep a qualifier on the row of the value that it limits. Show the scope of an attributed result as secondary text after the result.
- [SHOULD] Put exceptional observations directly after the results they contradict, before other evidence rows.
- [SHOULD] Show at most two items of a collection, then a secondary "N more" line.
- [SHOULD] When a policy result covers several members, show one line per result with its member count, failures first, and list the failed members after their count.
- [SHOULD] Put the attribution line after the divider and nothing after it.

# 4. Visual rules

- [MUST] Use only host typography: the h3 heading, body text and the host's code style. Do not set font family, size or weight.
- [MUST] Use color only through the theme tokens in Chapter 5. Do not write color literals.
- [MUST] Keep every result word in the body foreground color. Color the result icon only, so the meaning stays readable without color and passes contrast in light themes.
- [MUST] Render a full status word next to every result icon. Render an unrecognized status as escaped body text without an icon.
- [SHOULD] Labels, scopes, counts and attribution use the secondary text token.
- [SHOULD] Role badges use the badge token pair with a 4px radius and one non-breaking space of padding on each side. Use badges only for categorical roles, never for identifiers or metadata.
- [MUST] Keep the popover within the host's maximum width for typical values. Let long values wrap; do not hide overflow and do not shrink text.
- [MUST] Do not insert invisible characters into copyable values.
- [SHOULD] In the Markdown form, put identifiers in code spans, labels in strong text, secondary text in emphasis, and use the text markers of Chapter 5 instead of icons.

# 5. Available primitives

| Role            | Implementation name or value                                                                                                                                                                                                                                                              | Source                                   | Usage condition                         | Status              |
| :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------- | :-------------------------------------- | :------------------ |
| Popover surface | Native editor hover container                                                                                                                                                                                                                                                             | Host theme `editorHoverWidget.*`         | All lookup popovers                     | Implemented by host |
| Title           | `<h3>` with kind codicon; Markdown `###`                                                                                                                                                                                                                                                  | `packages/@birdcc/lsp/src/dn42-hover.ts` | One identifier                          | Implemented         |
| Kind icon       | `codicon-globe` (address), `codicon-organization` (autonomous system)                                                                                                                                                                                                                     | Same renderer                            | Title only                              | Implemented         |
| Property sheet  | `<table>` of label and value cells; Markdown hard-break lines                                                                                                                                                                                                                             | Same renderer                            | Facts below the summary                 | Implemented         |
| Secondary text  | `var(--vscode-descriptionForeground)`; Markdown emphasis                                                                                                                                                                                                                                  | Same renderer                            | Labels, scopes, counts, attribution     | Implemented         |
| Result icon     | `pass-filled` with `var(--vscode-testing-iconPassed)`; `pass` with `var(--vscode-editorInfo-foreground)`; `error` with `var(--vscode-errorForeground)`; `warning` with `var(--vscode-editorWarning-foreground)`; `question` and `circle-slash` with `var(--vscode-descriptionForeground)` | Same renderer                            | Defined results                         | Implemented         |
| Text marker     | `✓`, `↳`, `✗`, `!`, `?`, `⊘`                                                                                                                                                                                                                                                              | Same renderer                            | Markdown form of result icons           | Implemented         |
| Value icon      | `codicon-location`, `codicon-eye-closed`                                                                                                                                                                                                                                                  | Same renderer                            | Location answers and withheld locations | Implemented         |
| Role badge      | `var(--vscode-badge-foreground)` on `var(--vscode-badge-background)`, `border-radius:4px`                                                                                                                                                                                                 | Same renderer                            | Categorical roles in the summary        | Implemented         |
| Divider         | `<hr>`; Markdown `---`                                                                                                                                                                                                                                                                    | Same renderer                            | Before attribution                      | Implemented         |

- [MUST] Use only the primitives listed here. HTML spans may carry only `color`, `background-color` and `border-radius` styles, in that order, and only codicon classes. This matches the host sanitizer.
- [MUST] Escape every dynamic string for its form: HTML entities for `&<>"'` in the HTML form; backslash escapes and code spans in the Markdown form. Collapse whitespace so data cannot end a block.
- [MUST] This component has no custom style namespace and cannot override host primitives.

# 6. Copy and number formats

- [MUST] Keep technical identifiers intact and source qualifiers explicit.
- [SHOULD] Use sentence-case labels of one or two words. Keep standard abbreviations in their established case.
- [MUST] Show missing, inconclusive and conflicting values with different words when they describe different states.
- [SHOULD] Write counts as an integer and a noun with correct plural form.

# 7. Anti-patterns

- [SHOULD] Do not use code-span pills for status words or ordinary metadata.
- [SHOULD] Do not chain several facts on one line with separator dots.
- [SHOULD] Do not use italic text as a section heading.
- [SHOULD] Do not place cards inside the popover surface or add decorative icon tiles.
- [SHOULD] Do not color body text to carry meaning.
- [SHOULD] Do not give metadata labels the same emphasis as the identifier.

# 8. Implementation and integration

- [MUST] Keep presentation in `packages/@birdcc/lsp/src/dn42-hover.ts`. The server selects the form from the client capability recorded at initialization.
- [MUST] The VS Code client sets `markdown.supportHtml`. Every other Markdown producer of the server escapes dynamic text so that it stays inert as HTML.
- [MUST] Let the editor load fonts and select the theme. The popover imports no presentation assets.

## Glossary

| Name           | Meaning                                                   |
| :------------- | :-------------------------------------------------------- |
| Property sheet | The two-column label and value table below the summary    |
| Result icon    | A colored codicon that reinforces an adjacent status word |
| Text marker    | The Markdown-form character that replaces a result icon   |
| Role badge     | A badge-colored span for a categorical role               |
| Secondary text | Text in the description foreground token                  |
