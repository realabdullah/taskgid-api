# Working in this codebase

This guide is binding for everyone and every agent touching `taskgid` or
`taskgid-api`.

**Deviating from anything here requires Abdullah's approval before the work is
done, not after.** If a rule blocks you, stop and ask. A deviation shipped
without approval gets reverted regardless of merit.

---

## 1. Comments

Write a comment only where the code cannot say the thing itself. That means
non-obvious runtime behaviour, a constraint imposed from outside, or a trap the
next reader would otherwise fall into.

Do not write comments that:

- restate what the line below does;
- narrate a decision, a discussion, a plan, or a phase;
- justify why an alternative was rejected;
- record what changed relative to some earlier version.

That reasoning belongs in the commit message or the pull request, which is where
someone goes looking for it. Code comments are read by people trying to change
the line, not by people auditing how it came to exist.

```js
// Good — the reader cannot infer this.
// RFC 5545. Must carry an explicit DTSTART; without one rrule takes the
// time-of-day from the moment of parsing.

// Bad — restates the code.
// Set the parent id to null to promote the subtask.

// Bad — narrates a decision.
// We chose SET NULL here rather than CASCADE because deleting a parent
// should not silently discard work, which was the failure mode we wanted
// to avoid when we settled the subtask semantics.
```

The same applies to `README.md` and every other document. State what a thing
does and the facts a reader cannot infer. Do not restate trade-offs, alternatives
considered, or the history of a decision.

### README is not a changelog

Shipping a feature is not, by itself, a reason to add a section to `README.md`.
The README describes the system as it stands today, for someone who was not
here for any of the work that produced it. Before adding to it, ask: does this
belong in *reference documentation for the current system* — setup, running,
architecture, operational facts a contributor needs — or does it belong in the
PR description, which is where "what shipped and why" is supposed to live?

If it's reference material, it still has to earn a place: point at the source
of truth (`.env.example`, `openapi.yaml`, a script) instead of duplicating
values that will drift, and write it so it reads the same whether the feature
shipped an hour ago or three years ago — no "now supports," no "recently
added," no explaining the alternative that was rejected. When a new capability
changes an existing section's meaning, edit that section in place rather than
appending a new one next to it.

## 2. Commits and pull requests

Subject line: `(type): lowercase summary`, imperative, describing the change.

```
(fix): paginate tasks by task, not by joined row
(feat): add task checklists, start dates and effort estimates
(chore): untrack the docs directory
```

Types in use: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`.

The body explains the defect and the mechanism — what was wrong, what now
happens instead. Pull request titles and descriptions follow the same rule.

Never:

- credit Claude or any agent (`Co-Authored-By`, "Generated with…" footers);
- reference internal conversations, plans, phase numbers, or session history;
- describe what you intend to do next.

Branch from the default branch (`master` in `taskgid`, `main` in `taskgid-api`)
and name branches `feat/…`, `fix/…`, or `chore/…`. One concern per pull request.

## 3. Structure

Routes stay thin: validation middleware, then a controller. Controllers own
request and response shaping. Anything with real logic — spawning recurrences,
building digests, sending notifications — belongs in `src/services/`, so it can
be called by a script as well as by a request.

Cross-cutting helpers live in `src/utils/`. When a policy is applied at many
call sites, give it a named export there rather than repeating the literal, so
the choice is greppable (`src/utils/taskScope.js` is the pattern).

Respond through `successResponse` / `errorResponse`, and paginate through
`getPaginationParams` / `createPaginatedResponse`. Do not build response
envelopes by hand.

## 4. Database

- Every schema change needs a migration in `migrations/`.
	`sequelize.sync({force:false})` creates missing tables but never missing
	columns, so migrations run before the server, not after.
- Use the helpers in `scripts/migration-helpers.cjs` (`addColumnIfMissing`,
	`addIndexIfMissing`, …). This database predates migrations and drifts, so a
	blind `addColumn` fails the whole run.
- Postgres returns `COUNT(*)` as a string. Cast `::int`, or `"0"` is truthy.
- Prefer nulling a foreign key over cascading a delete when the referenced row
	carries work of its own.

## 5. Code style

Formatted by tooling; run it rather than matching by eye.

ESLint `google` config: 4-space indent, 120-column lines, single quotes, and
JSDoc on every exported function with `@param` and `@return`.

```bash
pnpm lint
```

## 6. Runtime constraints

The API is serverless. Nothing may rely on a long-lived process, in-memory state
shared between requests, or a persistent connection — realtime goes through
Pusher, and scheduled work through a cron-invoked script in `scripts/`.

Secrets used by CI live on the **Production** environment, so a workflow job
must declare `environment: Production` to receive them.

## 7. Verification

Claims about behaviour must be backed by having run it. Typechecking is not
evidence that a feature works. Exercise the change against a running stack, and
state plainly what you could not verify rather than implying coverage you do not
have.
