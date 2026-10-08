# Clean-repository validation

Verified from the exact source layout prepared for `ddthing/ff14-chcard2` after a clean `npm ci`:

- Next.js resolved to 16.4.0 through the project's existing `^16.3.7` dependency range and lockfile update.
- `npm run typecheck`: pass.
- `npm run lint`: pass (repository build outputs are ignored).
- `npm test`: 183 pass, 29 skip, 0 failures. The 29 skips require captured historical QA evidence directories deliberately omitted from the deployment checkout; those suites run locally when those directories are present.
- `npm run build`: exports seven static HTML pages, and copies the export to `dist/` for Cloudflare Pages.
- With no `.env.local`, the default Cloudflare export omits the opt-in Fan Kit and XIVAPI job-icon binaries from the deployed static assets.
- `npm audit --omit=dev`: no production dependency vulnerabilities. `npm audit fix` also leaves five high-severity notices in the development ESLint/transitive `braces` toolchain; resolving those by `--force` would downgrade `eslint-config-next` across the Next major and was not applied.
