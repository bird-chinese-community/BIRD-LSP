---
name: vibe-coding-github-sop
description: Standardize GitHub Issue, Epic, Sub-Issue, PR, label, and Projects v2 workflows for multi-agent vibe-coding collaboration. Use when managing GitHub org/repo work with gh/git, including task decomposition, project fields, branch and PR conventions, review states, or blocker handling.
---

# GitHub SOP

Use GitHub as the system of record. Use `gh` for remote state, `git` for local state, and keep issues, branches, PRs, and Projects v2 aligned.

## Start Here

- Prefer an Epic issue for any non-trivial theme.
- Break work into atomic sub-issues that one agent can finish.
- Attach the parent issue, project, milestone, and labels before work starts.
- Keep branches and PRs traceable to a single issue.
- If required info is missing, stop guessing and mark the issue blocked.

## Workflow

### 1. Create the Epic

Use an Epic to track one large theme end to end.

```bash
gh issue create --title "[Epic] <name>" --body "## Task\n..." --label "type/epic"
```

See [references/issue-workflow.md](references/issue-workflow.md) for the full pattern.

### 2. Split into Sub-Issues

- Write each sub-issue as one independently deliverable change.
- Add `Part of #<epic>` in the body.
- Apply `type/*`, `status/*`, and `agent/*` labels consistently.
- Keep the canonical label mapping in [references/label-system.md](references/label-system.md).

### 3. Branch and PR

- Use `issue/<id>/<type>-<short-desc>` for branches.
- Keep commits and PR titles conventional and issue-linked.
- Move the project item to `In progress` when implementation starts and `In review` after PR creation.
- Follow [references/git-workflow.md](references/git-workflow.md) and [references/gh-cli-commands.md](references/gh-cli-commands.md).

### 4. Review and Merge

- Do not merge until CI is green and review status is explicit.
- Treat `status/approved` and `status/changes-requested` as the source of truth for review state.
- Let the maintainer own final merge decisions unless the repo says otherwise.

## Blockers

- If a required API, label, field, or permission is missing, add `agent/blocked` and `help wanted`.
- Leave a short issue comment that names the missing dependency and the next action.
- Do not invent project field names or label semantics; check [references/project-fields.md](references/project-fields.md) and [references/status-mapping.md](references/status-mapping.md) first.

## References

- [references/issue-workflow.md](references/issue-workflow.md)
- [references/label-system.md](references/label-system.md)
- [references/git-workflow.md](references/git-workflow.md)
- [references/gh-cli-commands.md](references/gh-cli-commands.md)
- [references/project-fields.md](references/project-fields.md)
- [references/status-mapping.md](references/status-mapping.md)
