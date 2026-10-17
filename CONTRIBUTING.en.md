# Contributing

Thanks for wanting to help. Ideas, content fixes and code are welcome. **Nothing is published on the site without the maintainer's approval.**

*Version française : [CONTRIBUTING.md](CONTRIBUTING.md).*

## How it works

1. **An idea, a typo, a badly worded teaching question?** Open an *issue* ("Issues" tab > "New issue") with the right template. No code needed.
2. **Want to propose a change yourself?** Open a *pull request*:
   1. "Fork" the repository to your account.
   2. Create a branch: `git checkout -b my-fix`.
   3. Make your change and run the checks (see below).
   4. Push to your fork and open a *pull request* against `main`.
3. Automatic checks (types, tests, build) run on your pull request.
4. The maintainer reviews, may ask for changes, then merges. Only a merge updates the site.

Nobody but the maintainer can change `main` directly.

## Before opening a pull request

```bash
npm ci
npm run typecheck
npm test
npm run build
```

All three must pass. For a visual change, attach a screenshot (desktop and mobile).

## What helps the most

- **Teaching content**: an ambiguous statement, a wrong explanation, one that is too complicated for a beginner, a command wrongly accepted or wrongly rejected. Content lives in `src/content/` (lessons, challenges) and `src/content/scenarios.ts` (practice terminals).
- **Accessibility and mobile**: anything hard to read or to tap.
- **Reproducible bugs**: describe the device, the browser and the steps.

For a big feature (a new path, a new game mechanic), **open an issue first** so we can discuss it: it avoids a long piece of work being refused.

## Translations

The site exists in French and English. A translation fix is a valuable contribution: content is in `src/content/en/` (English) and
`src/content/fr/` (French), the interface in `src/i18n/messages/`. Read `src/i18n/GLOSSARY.md` before proposing a vocabulary change.
Both languages must keep the same structure: the tests check it. A review of the English text by a native speaker is especially welcome.

## Code rules

- Strict TypeScript, explicit names, small functions, errors handled explicitly (never an empty `catch`).
- No `innerHTML`: text goes through `textContent` or the helpers in `src/ui/dom.ts`.
- No dependency added without discussing it first (weight, license, maintenance).
- No secret, token or credential in the code or in a screenshot.
- No emoji in the interface. User-facing text in French, technical terms in English.
- Tests for added or fixed logic (`tests/`).

## Images, sounds, fonts, 3D models

Only add what you have the right to redistribute (free license, or your own work), and state the source and license in the pull request.

## Rights over your contribution

By opening a pull request, you confirm that you are the author of the content (or have the right to submit it) and that you agree it may be
integrated into the project and exploited with it, including for commercial purposes (for example if the site one day shows advertising).
If you do not agree, do not open a pull request: an issue is still possible.

## Security

Found a vulnerability? **Do not write it in a public issue.** See [SECURITY.md](SECURITY.md).

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). In short: respect, criticize the work and not the person.
