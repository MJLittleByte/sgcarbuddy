#!/usr/bin/env node
// Builds the static privacy / support site into site/_site (no dependencies; Node 20+).
//   node site/build.mjs           -> build
//   node site/build.mjs --check   -> build, then fail if anything looks wrong (used by CI)
// Values come from site/site.config.json; the app version comes from mobile/package.json.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, '_site');
const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'));
const appPkg = JSON.parse(readFileSync(join(root, '..', 'mobile', 'package.json'), 'utf8'));

const vars = { ...config, appVersion: appPkg.version, year: String(new Date().getFullYear()) };
const PAGES = ['index.html', 'privacy/index.html'];
const ASSETS = [
  ['styles.css', 'styles.css'],
  ['../mobile/public/brand/icon-round.svg', 'icon.svg'],
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const page of PAGES) {
  const html = readFileSync(join(root, page), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`${page}: unknown placeholder ${m}`);
    return escapeHtml(String(vars[key]));
  });
  mkdirSync(dirname(join(out, page)), { recursive: true });
  writeFileSync(join(out, page), html);
}
for (const [from, to] of ASSETS) cpSync(join(root, from), join(out, to));
writeFileSync(join(out, '.nojekyll'), ''); // serve files as-is, no Jekyll processing
writeFileSync(join(out, '404.html'), `<!doctype html><meta charset="utf-8"><title>Not found</title><meta http-equiv="refresh" content="0; url=${config.siteUrl}">`);

if (process.argv.includes('--check')) check();
console.log(`Built ${relative(process.cwd(), out)} (${config.appName} v${vars.appVersion})`);

function check() {
  const problems = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.contactEmail)) problems.push('contactEmail is not a valid email');
  if (!/^https:\/\/.+\/$/.test(config.siteUrl)) problems.push('siteUrl must be https:// and end with /');
  if (config.packageName !== 'com.sgcarbuddy.app') problems.push('packageName does not match the Android applicationId');
  // The app links to this site and this email (mobile/src/app/links.ts): keep them in step.
  const links = readFileSync(join(root, '..', 'mobile', 'src', 'app', 'links.ts'), 'utf8');
  if (!links.includes(`'${config.contactEmail}'`)) problems.push('contactEmail differs from SUPPORT_EMAIL in mobile/src/app/links.ts');
  if (!links.includes(`'${config.siteUrl}'`)) problems.push('siteUrl differs from SITE_URL in mobile/src/app/links.ts');
  for (const file of walk(out).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    if (/\{\{\w+\}\}/.test(html)) problems.push(`${relative(out, file)}: unreplaced placeholder`);
    // Every relative link / asset must exist in the built site.
    for (const [, href] of html.matchAll(/(?:href|src)="([^"#:?]+)"/g)) {
      const target = join(dirname(file), href);
      const ok = existsSync(target) && (!statSync(target).isDirectory() || existsSync(join(target, 'index.html')));
      if (!ok) problems.push(`${relative(out, file)}: broken link ${href}`);
    }
  }
  const privacy = readFileSync(join(out, 'privacy/index.html'), 'utf8');
  for (const must of [config.appName, config.contactEmail, config.developerName, 'Location']) {
    if (!privacy.includes(escapeHtml(must))) problems.push(`privacy policy is missing "${must}"`);
  }
  if (problems.length) {
    console.error('Site check failed:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
