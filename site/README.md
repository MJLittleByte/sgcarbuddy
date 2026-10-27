# Privacy / support site

Static site for the Google Play **Privacy policy URL** and support page.

- Live: https://mjlittlebyte.github.io/sgcarbuddy/ (privacy policy: `…/privacy/`)
- Source: `index.html`, `privacy/index.html`, `styles.css`, values in `site.config.json` (`{{placeholders}}`)
- Build locally: `node site/build.mjs --check` → `site/_site/` (open `site/_site/index.html`)
- Deploy: automatic on push to `main` via `.github/workflows/pages.yml` (GitHub Pages, source "GitHub Actions"),
  or **Actions → Privacy site → Run workflow**

The policy describes what the app actually does. **If you add an SDK (ads, analytics, crash reporting) or start
sending new data to the server, update `privacy/index.html`, `policyEffectiveDate` and the Play Data safety form
together.** The support email and site URL also appear in the app (`mobile/src/app/links.ts`); `--check` fails if
they differ.
