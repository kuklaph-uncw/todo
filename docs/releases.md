# Windows releases

ToDo uses public [GitHub Releases](https://github.com/kuklaph-uncw/todo/releases) for Windows x64 updates. Azure DevOps remains a source remote; it is not the download feed. No GitHub login or token is needed on users' machines.

The installed app checks once on launch, downloads a newer stable release, then asks whether to restart. Later keeps the app running and defers the prompt until the next launch. Closing the app normally does not install an update. Development runs do not check for updates. An offline or failed check is logged in `<vault>/.workledger/error.log` and leaves the app usable.

## Build

Build locally on Windows with Bun 1.4.4 and Microsoft Edge installed. The browser tests launch Edge headlessly and use disposable test vaults. The tools are pinned in `package.json` and `bun.lock`; no GitHub build service is required.

Install [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) locally before running checks. Download the archive for your platform, verify its SHA256 against the official release checksum, and place the executable at `.tools/gitleaks/gitleaks.exe` on Windows, or `.tools/gitleaks/gitleaks` on other platforms. Keep its LICENSE beside it. This ignored directory is a development tool, not part of the installed app.

Set a new stable version in `package.json`, greater than the previous release. Never replace the assets of an already published version. Install the locked dependencies, then run the release build:

```powershell
bun install --frozen-lockfile
bun run build:release
```

`build:release` stops on the first failure. It scans the working tree for secrets, checks formatting, lints, type-checks, runs the full test suite, and scans all local Git history. It then bundles the app, scans that bundle, and only packages it if every check passes. It does not change source files, commit, tag, or upload anything. Run it again after changing source or dependencies.

The build writes these files to `dist/` and never uploads them:

- `ToDo-Setup-<version>.exe`
- `ToDo-Setup-<version>.exe.blockmap`
- `latest.yml`
- `ToDo-<version>-win.zip`

Use the NSIS `.exe` installer for automatic updates. The zip is a manual distribution option; automatic updates are only supported for installed copies.

For individual development checks:

| Command | Purpose |
| --- | --- |
| `bun run check` | Scan the working tree for secrets, then run formatting checks, lint, TypeScript, and all tests without packaging |
| `bun run secrets` | Scan current source, including uncommitted files and any existing `out/` bundle |
| `bun run secrets:history` | Scan local Git history across all refs |
| `bun run secrets:build` | Scan the generated `out/` bundle |
| `bun run format` | Apply formatting to JavaScript, TypeScript, CSS, and JSON |
| `bun run format:check` | Check formatting without changing files |
| `bun run lint` | Report lint errors and warnings without changing files |
| `bun run typecheck` | Run the pinned TypeScript compiler without emitting files |
| `bun test` | Run unit, integration, and browser tests |
| `bun run build` | Package directly, without running quality checks |

Biome uses its recommended lint rules, with warnings treated as failures. It allows non-null assertions used for known matches and test fixtures, CSS specificity ordering, and `!important` overrides used for hidden elements, reduced motion, and printing. Formatting and linting respect `.gitignore`, excluding notes, generated builds, and dependencies.

Gitleaks runs locally with its default detection rules and redacted output. A finding, scanner failure, or history scan exceeding three minutes blocks the release command. `.gitleaks.toml` excludes root-level personal vaults, database files, dependencies, tool binaries, installers, and disposable files; it keeps application source, including `src/vault`, and `out/` in scope. These exclusions also apply to the history scan. Secret scanning detects credential patterns, not all confidential prose, and does not replace reviewing package contents before publishing. If it flags a real credential, remove it and revoke or rotate it; deleting the current text does not remove it from Git history.

The build is currently unsigned. Windows SmartScreen or organization policy may warn or block it. The updater checks the download against the release metadata's checksum; without a signing certificate it cannot verify a publisher identity. This does not disable TLS or checksum validation. Protect GitHub release publishing access.

## Publish an approved build

Commit and push the exact tested source to GitHub first. The following example creates a draft for version 1.3.0. Update the version and filenames together for later releases. `--target` must be the full commit SHA of the tested source, not a moving branch name. Do not upload `dist/*`, which can include old builds and diagnostic files.

```powershell
$releaseCommit = git rev-parse HEAD
gh release create v1.3.0 'dist/ToDo-Setup-1.3.0.exe' 'dist/ToDo-Setup-1.3.0.exe.blockmap' 'dist/latest.yml' 'dist/ToDo-1.3.0-win.zip' --repo kuklaph-uncw/todo --target $releaseCommit --draft --title 'ToDo 1.3.0' --notes 'Adds rich-text editing for journal entries, goal descriptions, and todo notes. Todo notes retain paragraph breaks and nested lists. Includes automatic updates from GitHub Releases.'
```

Review all four assets and release notes on GitHub. Drafts are ignored by the updater. After approval, publish the draft as a normal stable release, not a prerelease:

```powershell
gh release edit v1.3.0 --repo kuklaph-uncw/todo --draft=false --latest
```

Existing 1.1.0 and earlier installations need one manual install of the first updater-enabled version. Later versions can update automatically.

Version 1.3.0 adds marked blocks in `todos.md` when notes need blank lines, indentation, or literal checkboxes. Use 1.3.0 or newer to edit those notes. Older versions do not understand these blocks and can change their formatting when saving. Existing notes are read without a migration; blocks are written only when a todo is saved with formatting that needs them.

## Verify an update

Use disposable Windows test profiles or a VM so real notes and drafts are untouched. Install one updater-enabled version, then publish a higher version to a separate test repository configured as that build's feed. Confirm the older installed app downloads it, Later keeps it running, and Restart now runs the installer and reopens the newer version with notes and drafts intact. Test offline startup too.

Unit tests cover restart permission and failure handling. A successful build and generated `latest.yml` alone do not prove an installed-to-installed update.
