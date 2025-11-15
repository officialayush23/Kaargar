# Kaargar



# Branching architecture (short)

* `main` — production-ready branch (called **lsat-proof** in your setup). Protected: only merges via PR from `text`.
* `text` — *staging/integration* branch. All service branches merge here first. Run CI/tests here. If green → merge to `main`.
* Feature/service branches — one branch per service + platform:

  * frontend: `paymentf`, `ordersf`, `usersf`, ...
  * backend:  `paymentb`, `ordersb`, `usersb`, ...
* Hotfixes: `hotfix/<short-desc>` created from `main`, merged to `main` and `text`.

# Process flow (high level)

1. Create service branch (ex: `paymentf`) from `text` (or `main` if starting point is main).
2. Work locally, commit, push.
3. Open PR → merge into `text`. CI runs (unit, integration, lint).
4. QA on `text`. If bug → fix in service branch, merge back to `text`.
5. When all merged and `text` is stable, create PR to `main` (lsat-proof). Protect `main` so only PRs and required checks allowed.
6. Merge `text` → `main`, tag release if needed.
7. Delete merged feature branches.

# Commands — copy/paste ready

Assume remote is `origin`. Replace names where needed.

### Create branches (local → remote)

```bash
# start from text (staging) to make feature work predictable
git checkout text
git pull origin text

# create frontend branch for payment
git checkout -b paymentf

# ... make changes, then:
git add .
git commit -m "feat(paymentf): add payment UI v1"
git push -u origin paymentf
```

```bash
# backend branch
git checkout text
git pull origin text
git checkout -b paymentb
# work...
git add .
git commit -m "feat(paymentb): initial payment service endpoints"
git push -u origin paymentb
```

### Keep your branch up-to-date (recommended: rebase or merge)

```bash
# Method A: merge text into your branch
git checkout paymentf
git fetch origin
git pull origin text   # merges text into paymentf
# resolve conflicts if any, commit, push

# Method B: rebase your branch onto latest text (cleaner history)
git checkout paymentf
git fetch origin
git rebase origin/text
# resolve conflicts, then:
git push -f origin paymentf   # force push after rebase
```

### Merge a service branch into `text` (via CLI merge; prefer PRs on Git provider)

```bash
# Locally merge (safer to create PR on platform with CI)
git checkout text
git pull origin text
git merge --no-ff paymentf -m "chore: merge paymentf into text (integration)"
git push origin text
```

*But:* prefer creating a Pull Request from `paymentf` → `text` in GitHub/GitLab so CI and reviews happen.

### After all services merged to `text` and CI passes → merge to `main` (lsat-proof)

```bash
# create PR on platform: text -> main (lsat-proof)
# or local merge (if required)
git checkout lsat-proof
git pull origin lsat-proof
git merge --no-ff text -m "chore(release): merge staging text -> lsat-proof"
git push origin lsat-proof

# optional: tag release
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin --tags
```

### Hotfix flow

```bash
# create from main
git checkout lsat-proof
git pull origin lsat-proof
git checkout -b hotfix/fix-payment-500
# fix, commit, push
git push -u origin hotfix/fix-payment-500
# PR hotfix -> lsat-proof (and also merge into text)
```

### Delete branch after merge

```bash
# remote delete
git push origin --delete paymentf
# local delete
git branch -d paymentf
# if not merged, force delete:
git branch -D paymentf
```

# Recommended Git settings & rules (put these in README)

* Protect branches: `lsat-proof` (main) and `text`. Require:

  * Passing CI checks
  * 1 or 2 code reviewers
  * No direct pushes (only merges via PR)
* Branch naming:

  * Frontend: `<service>f` (e.g., `paymentf`)
  * Backend:  `<service>b` (e.g., `paymentb`)
  * Hotfix:   `hotfix/<desc>`
  * Feature/epic alternative: `feat/<service>/<desc>-f` (optional)
* Commit messages: Conventional Commits e.g., `feat(paymentf): add ...`, `fix(paymentb): ...`
* Merge strategy:

  * Use **Squash** or **Rebase and merge** for a clean main history; use **Merge commit** for `text` → `lsat-proof` to preserve integration grouping.
* CI:

  * Run linters, unit tests, and integration tests on PR to `text`.
  * Run deployment/production checks on PR to `lsat-proof`.
* Staging environment: `text` should auto-deploy to a staging environment for QA.

# Example README snippet (drop-in)

````md
## Branching model

- `lsat-proof` — Production branch (protected)
- `text` — Staging/integration branch (protected)
- Service branches:
  - frontend: `paymentf`, `ordersf`, `usersf`
  - backend:  `paymentb`, `ordersb`, `usersb`
- Hotfixes: `hotfix/<desc>`

### Workflow
1. Create branch from `text`:
   ```bash
   git checkout text
   git pull origin text
   git checkout -b paymentf
````

2. Commit & push:

   ```bash
   git add .
   git commit -m "feat(paymentf): add payment UI"
   git push -u origin paymentf
   ```
3. Open PR: `paymentf` → `text`. Wait for CI & review.
4. Merge to `text` when PR approved.
5. After all services pass QA on `text`, open PR: `text` → `lsat-proof`.
6. Merge into `lsat-proof` when checks pass. Tag release if required.

### Branch maintenance

* Keep branches up-to-date with `git rebase origin/text` or `git pull origin text`.
* Delete branches after merge:

  ```bash
  git push origin --delete paymentf
  git branch -d paymentf
  ```

### Rules

* No direct pushes to `text` or `lsat-proof`.
* All merges via PR with at least 1 approver + passing CI.
* Follow Conventional Commits.

```

# Quick UX / CI checklist (for README)
- [ ] PR template (what to test)
- [ ] Auto-deploy `text` -> staging
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Lint checks pass
- [ ] Manual QA sign-off on staging before merging `text` → `lsat-proof`

---







