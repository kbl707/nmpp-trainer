# RUN-fresh-history — replace the public repo with clean history

Runbook, not an executor brief · decision #8 · Owner: advisor + operator
Runs only after `ANON-ids-site`, `ANON-school-sync` and `ANON-docs` are
merged, migrated and live-verified.

The old repo's 50+ commits, PR refs and author email (`the personal author email`)
keep the names, and rewriting in place leaves them reachable through GitHub's
PR refs. So the repo is replaced: the old one is renamed and made private,
and a new public `kbl707/nmpp-trainer` gets one clean commit. The Pages URL
stays the same.

## 0. Before (advisor)
- [ ] Operator has updated the iPad bookmark to `/l/uzduotys/`. Then delete
      the `<old L path>/` redirect stub (one PR, CI green, deployed).
- [ ] The advisor replaces names with H / L in the `docs/` files (BRIEF,
      decisions under the #8 NOTE, sweeps, ops-log, briefs), in one commit.
- [ ] `git grep -n -i -E "h[e]nris|l[i]lija|a[g]urkas|d[y]sgraph|d[i]sgraf|k[u]bili"`
      on master → nothing. Fix anything left first.
- [ ] No open PRs, and no executor running.

## 1. New history (advisor, local)
- [ ] `git -C <scratch> init`; copy the tracked tree of master (`git
      archive master | tar -x -C <scratch>`); `git config user.name kbl707`;
      `git config user.email 110578208+kbl707@users.noreply.github.com`;
      one commit: "nmpp-trainer (fresh history, see docs/decisions.md #8)".
- [ ] `git log --format='%an %ae'` shows only the noreply identity.

## 2. Swap on GitHub (operator confirms each step)
- [ ] Old repo → rename to `nmpp-trainer-archive` and set **private**
      (operator, in GitHub settings). Its Pages site goes offline here.
- [ ] Create a new **public** `kbl707/nmpp-trainer` with no README, then push
      the scratch commit to `master`.
- [ ] Repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`: **operator** sets
      them (Settings → Secrets → Actions). The values are the same as before.
- [ ] Settings → Pages → Source: GitHub Actions. Environment `github-pages`
      → deployment branches: `master` only.
- [ ] Run the workflow (push or `workflow_dispatch`): check, then deploy,
      both green.

## 3. Verify (advisor)
- [ ] Live `/`, `/l/uzduotys/`, `/h/`, `/l/` render with no console errors,
      and the footer shows the new sha.
- [ ] `gh api repos/kbl707/nmpp-trainer/commits --jq length` → 1, and no
      names in `gh api …/commits` author data.
- [ ] The Claude Desktop project: operator re-adds GitHub → `docs/` →
      sync (the repo id changed).
- [ ] Local checkout: `git remote set-url origin …` (same URL), `git fetch`,
      `git reset --hard origin/master` (local branches from old executors
      are dropped).
- [ ] Ops-log line; decision #8 status → PASS once its verdict query
      passes.

## 4. Later (operator)
- [ ] Delete `nmpp-trainer-archive` when you no longer need the PR history.
      This is irreversible, so it's your call, not the advisor's.
- [ ] Set your global git email to the noreply address, so new commits
      don't bring the surname back.
