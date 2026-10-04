# Native Asterloom and exported learning games

`main.mjs` runs the same complete studio in a sandboxed Electron window, alongside the local import/multiplayer service. The renderer uses the stable `asterloom://app` origin, so changing the internal HTTP port does not lose IndexedDB progress. Node integration is disabled; the context-isolated preload exposes only immutable bootstrap data and the export action and narrowly scoped Tor controls.

## Build and run

```sh
npm run build
node desktop/download-tor.mjs
node scripts/package-desktop.mjs
```

The default build produces these development bundles:

- `release/desktop/Asterloom-darwin-arm64/Asterloom.app` — Apple Silicon macOS application.
- `release/desktop/Asterloom-darwin-x64/Asterloom.app` — Intel macOS application.
- `release/desktop/Asterloom-win32-x64/Asterloom.exe` — Windows x64 executable inside its required portable folder.

Double-click the `.app` or `.exe`. Windows users must retain its sibling resources and runtime files. This is a portable application folder, not a lone dependency-free Windows binary. `--platform=mac` builds both Mac variants; `--platform=mac-arm64`, `--platform=mac-intel`, and `--platform=windows` build one target.

For developer launch after a frontend build and validator generation, use `electron .` with root package main set to `desktop/main.mjs`. The packaging command regenerates `desktop/generated/package-validation.mjs` from the same TypeScript package validator used by the browser. Keep it synchronized after validator changes.

## Export a game

Inside a notebook, choose Export → Mac or Windows. The native dialog asks for a destination folder. The application copies an existing runtime and embeds **only the selected, validated notebook** into `resources/game.learnpack`. No creator progress, provider settings, API keys, local room tokens or unrelated notebooks are copied. Every exported application retains the complete studio, imports, editing, play, save, remix and re-export workflows.

The same-platform runtime can be copied from the current installed application. Cross-platform export requires a matching template in one of:

1. `ASTERLOOM_TEMPLATE_DIR` (an explicitly configured operator path).
2. `release/desktop` in a development checkout or the sibling release directory.
3. `desktop-templates` inside the application resources directory.

Missing templates produce an actionable error; the app does not claim a cross-platform bundle was created. The preload reports `availableExports` to the UI. The export result is `{path,identity,notebookId,platform,signing}`, `{canceled:true}`, or `{error}`.

A CLI export is also available:

```sh
node scripts/export-desktop.mjs notebook.learnpack mac ./release/games
node scripts/export-desktop.mjs notebook.learnpack mac-intel ./release/games
node scripts/export-desktop.mjs notebook.learnpack windows ./release/games
```

For a separately hosted room service, its operator must allow `asterloom://app` with `LEARN_ALLOWED_ORIGINS`; the native app does not disable browser CORS. Relative API requests to its own bundled service are proxied internally. Native builds prepared with the verified Tor runtime provide an opt-in onion transport. The bundled service allows its own stable native origin. Standard browsers need their own compatible Tor transport.

An exported game has a deterministic package identity based on its complete notebook. Device saves live under the user’s application-data directory at `Asterloom/games/<identity>`. The main studio uses `Asterloom/studio`. Moving an identical game preserves its namespace; a changed content revision gets its own namespace. Exported games can create additional notebooks locally, but each subsequent export again includes only the chosen notebook. Developers can set `ASTERLOOM_DATA_DIR` to a temporary directory for isolated launch tests; notebook content cannot set this path.

## Distribution status

These are **development builds**. No Apple Developer ID certificate, notarization credentials, or Windows Authenticode certificate is configured. macOS game exports are re-signed ad hoc on a Mac after embedding their notebook, which supports local testing but is not trusted commercial signing. Operating systems may warn or block distribution builds; their normal trust protections are not bypassed.

This implementation does not supply an installer, automatic signed updates, verified Windows execution from macOS or real-user compatibility certification. Desktop bundle structure and notebook isolation have automated tests. A successful cross-build alone does not prove that the Windows binary has been executed on Windows.

## Test

```sh
node --test desktop/bundles.test.mjs
```

Tests verify native export layout, executable-mode preservation, one-notebook inclusion, namespace isolation, credential exclusion, template availability, invalid package rejection and protection against recursive exports. They use lightweight runtime fixtures; run separate smoke tests against built native executables before distribution.

## Bundled Tor transport

`node desktop/download-tor.mjs` retrieves the official Tor Expert Bundle 15.0.24 (Tor 0.4.9.13) for macOS arm64, macOS x64 and Windows x64. Use `--host` or `--platform=mac-arm64`, `--platform=mac-intel`, `--platform=windows` for one target. Archives must pass both the signed SHA-256 list and detached OpenPGP signature using the pinned Tor Browser signing fingerprint `EF6E286DDA85EA2A4BA7DE684E2C6E8793298290`. The verification records, official license files and platform runtime accompany packaged builds. Binaries and archives stay out of Git. Official sources: [Tor download](https://download.torproject.org/tor/), [release directory](https://dist.torproject.org/torbrowser/15.0.24/), [signing-key documentation](https://support.torproject.org/tor-browser/getting-started/verifying-tor-browser/).

On macOS the verified extracted Mach-O files receive local ad-hoc signatures, required to run unsigned expert binaries on Apple Silicon. This changes those extracted executable files after archive verification; the original signed archives are retained. It does not establish Apple Developer ID trust or notarization. Packaging copies only the selected platform's Tor runtime. Missing runtime builds report Tor unavailable.

Enable Tor in Settings or the room panel. The setting is saved per app/game profile. A dedicated Tor process has an ephemeral loopback SOCKS listener and a stable per-profile onion identity. `setTorEnabled(boolean)` and `getTorStatus()` return `{installed,status,bootstrap,socksPort,hostname,reachabilityVerified,proxyConfigured,error?}`. Status is `ready` only after bootstrap reaches 100% and a valid v3 onion hostname exists. Readiness is not a guarantee that every peer or network can connect.

Electron's PAC routes only `.onion` through that SOCKS listener; localhost and normal internet requests stay direct. With Tor disabled, onion requests use a deliberately closed loopback proxy and cannot fall back to direct DNS. The onion service exposes only joining rooms, authenticated standings/results/events and health. It cannot open the author's studio, create rooms, import sources or call the AI proxy. Tor protects the transport; the room host can still read names and scores.

Copying a room invitation includes its onion address automatically when Tor is ready. Native recipients can paste that invitation; joining starts their bundled transport and waits for connection. Results are saved at mission completion even when the room dialog is closed. They sync when the room is opened or reconnected. The host must be running to receive them; this is not an always-online mailbox.

Optional real-network checks:

```sh
ASTERLOOM_TOR_TEST=1 node --test server/tor.integration.test.mjs
ASTERLOOM_NATIVE_TOR_TEST=1 node --test desktop/tor-smoke.test.mjs
```

These use separate temporary profiles and real independent Tor processes. They are deliberately excluded from deterministic CI because public Tor bootstrap and descriptor publication depend on the network. A successful local two-process test establishes real onion connectivity, not compatibility on every network or Windows device.

For the complete native save/play/remix/export smoke test against a built executable:

```sh
ASTERLOOM_NATIVE_SMOKE=1 ASTERLOOM_SMOKE_APP="/absolute/path/to/Asterloom.app/Contents/MacOS/Asterloom" node --test desktop/native-smoke.test.mjs
```

On Windows point `ASTERLOOM_SMOKE_APP` at `Asterloom.exe` and set the environment variables with the shell's native syntax. CI runs the platform-specific native smoke on both Windows and macOS.
