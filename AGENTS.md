# Repository instructions — Union World / Artvideo

## Target branch and delivery
- **Default delivery branch: `main`.** The project owner explicitly requires production-facing changes to land in `main`; a change committed only to another branch or left in an open PR is **not delivered**.
- Unless the user explicitly requests a separate branch or PR, edit the current `main` directly, use the latest remote `main` as the starting point, and verify the resulting commit is reachable from `main`.
- Do not create feature branches merely as a default workflow. If tooling forces a temporary branch or PR, clearly identify that limitation and integrate its changes into `main` before reporting completion, provided the change is safe to integrate.
- Never force-push or reset `main` to an older branch. When importing pending work, reconcile against the latest `main`, preserve newer UI behavior, and resolve conflicts explicitly; do not overwrite the current UI with an old branch snapshot.

## Production pipeline
- `.github/workflows/deploy-hostgator.yml` is triggered by pushes to `main`; the PR workflow does **not** publish the CRM or site.
- The production workflow first executes the CI tests, then builds the site and CRM, then publishes over FTPS only if the build is current. A green commit in GitHub alone does not establish that FTPS deployment succeeded.
- Before reporting a task as published, verify the relevant deployment run completed successfully. If GitHub Actions or FTPS status cannot be inspected, explicitly state **committed to main; publication not verified**.
- After changing a UI component, update its regression tests at the same time, and run or check the applicable tests/build whenever tools permit. Never weaken a regression just to satisfy CI while breaking the user's requested behavior.
- Database migrations, Storage policies, and Supabase Edge Functions often require separate application/deployment. Commit required migration files to `main` and coordinate database/Edge Function deployment before relying on new APIs. Never treat a GitHub commit as proof that Supabase code was deployed.

## Product and tenancy invariants
- Keep strict organization-level isolation for products, orders, customers, inventory, finance, and connected services.
- Preserve the latest agreed UI choices in `main` when incorporating work from a stale PR/branch.
- Avoid changing unrelated business workflows, permissions, billing data, or production user data while integrating a UI change.

## Final report
- Include the `main` commit SHA/URL and distinguish **code committed**, **tests**, **Supabase deployment**, and **HostGator publication**.
- Identify pending or conflicted changes that are still outside `main`. Do not claim those are live.
