# Native Asterloom and exported learning games

`main.mjs` runs the same complete studio in a sandboxed Electron window, alongside the local import/multiplayer service. The renderer uses the stable `asterloom://app` origin, so changing the internal HTTP port does not lose IndexedDB progress. Node integration is disabled; the context-isolated preload exposes only immutable bootstrap data and the export action and narrowly scoped Tor controls.

## Build and run

```sh
npm run build
node desktop/download-tor.mjs
node scripts/package-desktop.mjs
```

The default build produces two portable development bundles:

- `release/desktop/Asterloom-darwin-universal/Asterloom.app` — one Mac application containing both supported processor architectures.
- `release/desktop/Asterloom-win32-x64/Asterloom.exe` — Windows executable inside its required portable folder.

Double-click the `.app` or `.exe`. Windows users must retain the sibling resources and runtime files. `--platform=mac` builds the universal Mac application; `--platform=windows` builds Windows. Historical `mac-arm64` and `mac-intel` build arguments are accepted as aliases for the universal Mac build. Mac assembly requires macOS; no processor choice appears in the product's export menu. The current Electron runtime requires macOS 13 or newer.

The Mac pipeline builds disposable architecture-specific inputs, combines the locked Skia canvas bindings into `skia.darwin-universal.node`, and uses `@electron/universal` to combine Electron, Tor and its native libraries. Every resulting Mach-O file must contain both architectures. Shared code, documents, graphics and music remain shared. The merged development app is ad-hoc sealed and strictly verified without publisher credentials; Developer ID release signing remains separate. Disposable inputs are removed before publication. An old single-architecture Mac app is rejected as a universal export template.

Packaging automatically resolves missing Tor runtime archives through the signature-verified downloader and locked native canvas archives through the checksum-verified dependency resolver. Node, Electron, PDF/Office/EPUB extraction and Tor ship with the application; recipients do not install a Node runtime or developer tools. Tesseract OCR and speech transcription are not bundled: images can use author descriptions, and audio/video can use uploaded transcripts. These optional capabilities must never be advertised as installed automatically.

The packager downloads the exact target platform canvas N-API binding from the npm URL in `package-lock.json`, verifies its locked SHA-512 integrity, and installs it after pruning. Wrong-platform bindings are removed; any additional unconfigured production native module makes the build fail. This keeps PDF extraction available in cross-built Windows and Intel Mac bundles. Actual native smoke tests also extract a real PDF through the bundled service.

For developer launch after a frontend build and validator generation, use `electron .` with root package main set to `desktop/main.mjs`. The packaging command regenerates `desktop/generated/package-validation.mjs` from the same TypeScript package validator used by the browser. Keep it synchronized after validator changes.

## Export a game

Inside a notebook, choose Export → Mac or Windows. The native dialog asks for a destination folder. The application copies an existing runtime and embeds **only the selected, validated notebook** into `resources/game.learnpack`. No creator progress, provider settings, API keys, local room tokens or unrelated notebooks are copied. Every exported application retains the complete studio, imports, editing, play, save, remix and re-export workflows.

The current universal Mac application or Windows application can be copied as the corresponding runtime. Old `mac-intel` and `mac-arm64` export targets are accepted as aliases to the universal Mac target. Cross-platform export requires a matching template in one of:

1. `ASTERLOOM_TEMPLATE_DIR` (an explicitly configured operator path).
2. `release/desktop` in a development checkout or the sibling release directory.
3. `desktop-templates` inside the application resources directory.

Missing templates produce an actionable error; the app does not claim a cross-platform bundle was created. The preload reports `availableExports` to the UI. The export result is `{path,identity,notebookId,platform,signing,notarized:false,warning}`, `{canceled:true}`, or `{error}`. The warning explains that newly embedded content cannot retain publisher trust. The manifest records the actual ad-hoc or unsigned state before resource sealing.

A CLI export is also available:

```sh
node scripts/export-desktop.mjs notebook.learnpack mac ./release/games
node scripts/export-desktop.mjs notebook.learnpack windows ./release/games
```

For a separately hosted room service, its operator must allow `asterloom://app` with `LEARN_ALLOWED_ORIGINS`; the native app does not disable browser CORS. Relative API requests to its own bundled service are proxied internally. Native builds prepared with the verified Tor runtime provide an opt-in onion transport. The bundled service allows its own stable native origin. Standard browsers need their own compatible Tor transport.

An exported game has a deterministic package identity based on its complete notebook. Device saves live under the user’s application-data directory at `Asterloom/games/<identity>`. The main studio uses `Asterloom/studio`. Moving an identical game preserves its namespace; a changed content revision gets its own namespace. Exported games can create additional notebooks locally, but each subsequent export again includes only the chosen notebook. Developers can set `ASTERLOOM_DATA_DIR` to a temporary directory for isolated launch tests; notebook content cannot set this path.

## Distribution status

The ordinary packaging command produces **development builds**. Developer ID signing is an explicit, separate release step; no certificate is selected automatically or bundled with the application. No notarization credentials or Windows Authenticode certificate are configured by this repository. macOS game exports are signed in local temporary storage and published into the selected destination after embedding their notebook; this supports File Provider destinations that synthesize unsignable Finder metadata. They are re-signed ad hoc on a Mac, which supports local testing but is not trusted commercial signing. Operating systems may warn or block distribution builds; their normal trust protections are not bypassed.

To prepare a separate Mac signing candidate using an existing Developer ID identity in the operator's Keychain:

```sh
mkdir -p release/signing-candidates/mac
node scripts/sign-desktop.mjs --identity "Developer ID Application: YOUR NAME (TEAM)" --app "release/desktop/Asterloom-darwin-universal/Asterloom.app" --output "release/signing-candidates/mac/Asterloom.app"
```

The command requires an existing output directory and does not rebuild or modify the original app. It uses `@electron/osx-sign` to sign nested Mach-O files and bundles from the inside out, with secure timestamps and hardened runtime. The signing process reports each code object and has a 180-second bound; a blocked Keychain request or timestamp connection ends the signing worker and its child processes. Electron processes receive only the `allow-jit` entitlement; Tor and native libraries receive no exception entitlements. Camera, microphone, unsigned-memory, debugger and library-validation exceptions are not granted. It checks every native signature and performs strict deep verification before creating the candidate and its `.signing.json` report. Only new-copy Finder presentation metadata is removed; quarantine and provenance remain intact.

A signing candidate is **not yet a validated or notarized release**. Run the actual native smoke (including bundled PDF extraction), retained-game launch and real Tor smoke against the candidate before publishing it. The report starts with `runtimeValidation: "pending"`; successful signing alone does not change that status. Verify both slices of the same universal app; Intel execution under Rosetta verifies that mode on the test machine, not compatibility with every Intel Mac.

Notarization requires an independently configured `notarytool` authentication profile, an Apple submission, an accepted result and stapling/validation. Developer ID signing alone does not establish Gatekeeper approval. The signing command does not search for credentials, submit to Apple or claim notarization. See [Electron's signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing) and [Apple's notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

Every recipient-created export changes the notebook inside the application's sealed resources. It cannot inherit the publisher's signature or notarization ticket. The current export flow creates an ad-hoc signed development app. Trusted distribution of each new game requires a separate authorized signing/notarization step; an alternative future design is an immutable signed player plus an external editable `.learnpack`. Publisher private keys must never be shipped to creators.

This implementation does not supply an installer, automatic signed updates, verified Windows execution from macOS or real-user compatibility certification. Desktop bundle structure and notebook isolation have automated tests. A successful cross-build alone does not prove that the Windows binary has been executed on Windows.

## Test

```sh
node --test desktop/bundles.test.mjs
```

Tests verify native export layout, executable-mode preservation, one-notebook inclusion, namespace isolation, credential exclusion, template availability, invalid package rejection and protection against recursive exports. They use lightweight runtime fixtures; run separate smoke tests against built native executables before distribution.

## Bundled Tor transport

`node desktop/download-tor.mjs` retrieves the official Tor Expert Bundle 15.0.24 (Tor 0.4.9.13) for macOS arm64, macOS x64 and Windows x64. Use `--platform=mac` for both Mac inputs, `--platform=windows` for Windows, or `--host` for a developer host only. Archives must pass both the signed SHA-256 list and detached OpenPGP signature using the pinned Tor Browser signing fingerprint `EF6E286DDA85EA2A4BA7DE684E2C6E8793298290`. The verification records, official license files and platform runtime accompany packaged builds. Binaries and archives stay out of Git. Official sources: [Tor download](https://download.torproject.org/tor/), [release directory](https://dist.torproject.org/torbrowser/15.0.24/), [signing-key documentation](https://support.torproject.org/tor-browser/getting-started/verifying-tor-browser/).

The pipeline also downloads the exact Tor 0.4.9.13 core source archive from `https://dist.torproject.org/tor-0.4.9.13.tar.gz`, verifies its signed checksum against David Goulet's pinned official release key `B74417EDDF22AC9F9E90F49142E86A2A11F48D36`, and carries the archive plus verification record into each native build/export. `--sources-only` refreshes just that source archive. [Tor's source verification instructions](https://support.torproject.org/little-t-tor/getting-started/verifying/) establish the signing key and checksum procedure.

The expert binary reports GPLv3 because its PoW libraries are enabled; [Tor documents this build distinction](https://community.torproject.org/onion-services/advanced/dos/). The included core source and original license notices are preserved, but they are not a certification of complete corresponding-source compliance for every dependency/transport. Public commercial distribution still requires a complete dependency/source and licensing review.

On macOS the verified extracted Mach-O files receive local ad-hoc signatures, required to run unsigned expert binaries on Apple Silicon. This changes those extracted executable files after archive verification; the original signed archives are retained. It does not establish Apple Developer ID trust or notarization. Packaging resolves the required Tor runtime; universal Mac assembly combines both verified Mac variants.

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


## Encrypted account state

The local service receives a credential store backed by Electron `safeStorage`. Tokens are stored as encrypted bytes in `ai-account.enc` under the current studio/game user-data profile, with atomic private-file writes. This file is never inside an exported application or notebook. The helper rejects unavailable encryption and Linux's `basic_text` backend instead of falling back to plaintext. Signing out deletes the encrypted file. API keys remain governed separately by the service's per-request handling.

## Universal runtime validation

Run the same native save/PDF/export/remix test in both modes on Apple Silicon with Rosetta installed:

```sh
ASTERLOOM_NATIVE_SMOKE=1 ASTERLOOM_SMOKE_ARCH=arm64 ASTERLOOM_SMOKE_APP="/path/Asterloom.app/Contents/MacOS/Asterloom" node --test desktop/native-smoke.test.mjs
ASTERLOOM_NATIVE_SMOKE=1 ASTERLOOM_SMOKE_ARCH=x64 ASTERLOOM_SMOKE_APP="/path/Asterloom.app/Contents/MacOS/Asterloom" node --test desktop/native-smoke.test.mjs
```

The test launches an isolated wrapper selecting the requested slice and asserts the actual Electron architecture. The same `ASTERLOOM_SMOKE_ARCH` setting is supported by the optional native Tor test. Exported and remixed games are launched in the selected mode too.

## Original recordings and portable archives

The native protocol forwards recording uploads as streams rather than buffering them as JSON/Base64. FFmpeg and whisper.cpp are bundled for Mac Universal and Windows; verified speech models download on first use and remain in the app-managed shared cache. Each exported game copies only its selected notebook's original media files, with content hashes checked before and after copying.

Narrow IPC methods `exportNotebookArchive(packageText)` and `importNotebookArchive()` present native dialogs and stream `.learnzip` backups. Export returns `{path,assetCount,bytes}`; import returns `{packageText,assetCount,notebookId}`. Either can return `{canceled:true}` or `{error}`. Archives do not carry provider keys, model caches, room secrets or learner profiles. See [LOCAL-MEDIA.md](../docs/LOCAL-MEDIA.md) for source pins, licensing, build tools, limits and tests.
