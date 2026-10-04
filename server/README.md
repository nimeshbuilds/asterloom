# Asterloom local service

The service supplies format extraction, optional API authoring, and persistent invitation-only learning rooms. It binds to `127.0.0.1:4319` and serves the production `dist/` application when present. No account or provider key is required to use local import or rooms.

## Run

Use Node 22.19 or later and the root dependencies.

```sh
npm install
npm run dev
```

For the built application:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:4319`. Native packaging can launch `createService()` directly and load this local address. Stop the service cleanly with SIGINT/SIGTERM. Tests use temporary directories and ephemeral ports:

```sh
npm run test:server
```

## Supported source paths

`GET /api/health` reports actual installed capabilities and limits. Text, Markdown, CSV, TSV, JSON, HTML, SRT and VTT are processed locally. PDF extracts selectable text; DOCX extracts document text; PPTX extracts slide text; XLSX extracts cells; EPUB extracts chapter text in spine order and rejects encryption declarations. Scanned PDFs, chart semantics, embedded images and complex reading order require creator review or an accessible text version.

Images use a locally installed `tesseract` executable if present. Otherwise images are accepted as attachments and require a description. MP3/MP4 and other listed audio/video formats are accepted as attachments and require a transcript. **Automatic speech transcription is not implemented**; detection of FFmpeg or Whisper does not imply a working transcription pipeline. The original binary is not retained on this server; the client owns attachment persistence.

Public web pages are fetched with private-address denial, DNS-pinned requests, redirect revalidation, a response-size bound and timeouts. Sites requiring JavaScript, authentication or a paywall may need manual upload or paste. No authentication walls are bypassed.

NotebookLM, YouTube and private Drive links return guided import instructions. This service does not claim to extract entire shared notebooks or arbitrary YouTube captions. Download source material or generated artifacts you are allowed to reuse, and upload transcripts or paste their text.

## REST contracts

All mutation requests use `Content-Type: application/json`. Errors have `{ "error": "Actionable message", "code": "ERROR_CODE" }` and an appropriate non-2xx HTTP status.

- `GET /api/health` → `{ok,version,capabilities,limits,storage,multiplayer}`.
- `POST /api/import-file` with `{name,text}` or `{name,mimeType?,dataBase64}` → `{source:{id,title,kind,content,metadata},warnings,needsTranscript?,instructions?}`. A decoded file is limited to 20 MiB. `needsTranscript:true` means the empty `source.content` is not ready for game generation.
- `POST /api/import-url` with `{url}` → the same source result, or `{needsAssistance:true,kind,url,instructions}`. Assisted responses do not contain successfully extracted content.
- `POST /api/generate` with `{provider,apiKey?,model,baseUrl?,prompt,system?,maxOutputTokens?,jsonMode?}` → `{text,usage,provider,model}`. Provider is `openai`, `anthropic`, `xai`, or `compatible`. Keys are held in request memory and never saved or logged. Provider error details are suppressed to avoid leaking submitted private data. API billing is separate from consumer subscription access. This endpoint does not implement subscription OAuth.
- `POST /api/generate-image` with `{provider:'openai'|'compatible',apiKey?,model,baseUrl?,prompt,quality?,size?}` → `{dataUrl,mimeType:'image/png',width,height,provider,model,usage,needsReview:true}`. This is an optional explicit authoring action, never a gameplay dependency. It requests exactly one PNG, defaults to `quality:'low'` and `size:'1024x1024'`, accepts up to 10 MiB of decoded image data, and returns only base64 image data. URL-only outputs are rejected without fetching. The provider sees the submitted prompt and its API may incur charges. Review generated educational images against sources; model output is not factual evidence. Current request/response shape follows the [official image creation reference](https://developers.openai.com/api/reference/resources/images/methods/generate).
- `POST /api/rooms` with `{notebookId,notebookTitle,playerName,packHash?,missions?:[{id,maxScore}]}` → `{roomId,inviteCode,playerId,playerToken,standings,results,...}`.
- `POST /api/rooms/join` with `{inviteCode,playerName,packHash?}` → `{roomId,playerId,playerToken,standings,results,...}`. Supplying the pack fingerprint rejects a mismatched notebook revision.
- `GET /api/rooms/:roomId` with `Authorization: Bearer PLAYER_TOKEN` → current metadata, standings and the last 100 events.
- `POST /api/rooms/:roomId/results` with the same authorization and `{eventId,missionId,score,maxScore,correct?,total?,durationMs?}` → updated standings. Events are idempotent per player and event ID. Only each player's best result per mission contributes to the total.
- `GET /api/rooms/:roomId/events` with the same authorization provides SSE revision notifications. Polling is also supported. A normal browser EventSource cannot set authorization headers, so use fetch streaming or authenticated polling.

Rooms are written atomically to `server/.data/rooms.json`. Invitation secrets and player tokens are stored as SHA-256 hashes. Results have bounded scores and mission checks, but are **friendly self-reported competition**. An editable offline game cannot establish cheat-proof play. Rooms are not end-to-end encrypted, and the service operator can read names and scores. Learners need the same notebook revision and reachable service address. A stopped local service is not a permanent mailbox.

## Local models and networking

OpenAI-compatible endpoints on localhost ports 11434 and 1234 are allowed by default. Configure additional explicit origins with `LEARN_AI_ORIGINS`, a comma-separated list. Remote compatible endpoints must use HTTPS and pass private-address checks. Authoring redirects are never followed with credentials.

`PORT` selects the local service port. `LEARN_ALLOWED_HOSTS` allows explicit reverse-proxy host headers; `LEARN_ALLOWED_ORIGINS` adds browser origins. These are operator settings, not notebook-supplied values. Browser `file:` pages with an opaque origin do not receive access to local privileged endpoints. Open the notebook in the running local/native application for service features.

## Optional Tor transport

The native application bundles a verified optional Tor runtime and exposes its enable/disable controls. The standalone service can also use Tor already on PATH:

```sh
node server/index.mjs --tor
```

A caller can pass an explicit trusted executable path with `createService({torBinary,enableTor:true})`. This launches a dedicated Tor process with a private persistent data directory, an ephemeral loopback SOCKS listener and a v3 onion service. `/api/tor/status` and `/api/health` report `installed`, `status`, `bootstrap`, `socksPort`, `hostname`, and `reachabilityVerified`. `ready` requires bootstrap 100% plus a valid hostname; `reachabilityVerified` remains false unless an independent probe is explicitly recorded. A hostname file alone is not treated as a completed network connection.

Onion port 80 forwards to a separate loopback gateway that permits only health, room join and authenticated room standings/results/events. Authoring, source imports, AI requests, room creation and the studio are inaccessible through the onion service, even when a remote caller forges a localhost Host header. Native apps provide onion-only SOCKS routing; a normal browser cannot gain Tor transport just by pasting an onion URL.

`createService()` returns `startTor()`, `stopTor()`, `torStatus()` and `close()`; only the native trusted IPC can mutate the transport setting. Its HTTP API has no enable-Tor action. Both sides need eventual access to the running host service; nonoverlapping delivery needs a separately persistent mailbox. Scores stay queued on the player's device while the host is unavailable.

Run the opt-in real-network test with `ASTERLOOM_TOR_TEST=1 node --test server/tor.integration.test.mjs`. It verifies independent Tor processes, onion HTTP, invitation join, result authorization, deduplication and standings. Public-network bootstrap can stall or be blocked. This test is additional to the deterministic service suite, not a claim of universal network or cross-machine compatibility.

## Security and release boundaries

The service denies unrecognized Host and browser Origin headers, limits requests, rejects private/reserved source-fetch destinations, pins DNS addresses, bounds uploads/archive expansion, and never executes imported code. Production hardening still needs parser isolation under process/memory limits, durable authenticated backup/restore, richer room administration, abuse controls, signed application updates, installer/notarization tests, and independent security review before internet-facing commercial deployment.

The test suite exercises real Office/PDF fixtures, actual HTTP provider proxying against a local fake model, persistence/restart, credential hashing, scoreboard idempotency, score bounds, origin/host controls, source assistance behavior, and malicious archive cases. It does not prove learning effectiveness, public provider availability, encrypted room content, subscription sign-in or compatibility on every Tor network.
