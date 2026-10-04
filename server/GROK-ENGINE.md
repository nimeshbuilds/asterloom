# Grok connection

Asterloom's optional Grok connection uses the official Grok Build executable and its Agent Client Protocol. It does not reuse a browser session, an API key, or credentials from an existing Grok installation. Access and usage remain subject to the user's provider account and plan; the xAI API-key route is separate.

The user selects Install engine, then Connect. Installation downloads version 1.0.46 into the application's private data directory, verifies the pinned compressed and executable SHA-256 values and exact byte lengths, and atomically activates the executable. Mac Apple Silicon, Mac Intel, and Windows x64 are pinned. The Grok executable is downloaded on request, not redistributed inside the notebook. Pins were calculated from the official HTTPS artifacts identified by the official stable pointer and install script on 2026-10-04; they are application-maintained integrity pins, not a claimed vendor detached signature. Runtime updates require a reviewed manifest change. No shell installer is executed or system PATH modified.

The engine owns its account credentials under a private `GROK_HOME`. Device sign-in returns a provider-owned HTTPS link and short code. Asterloom records only a successful process completion marker. Disconnect stops active work and removes that private account directory, without touching any other installation. Account files, runtime state, and prompts are not notebook-export content. Status does not launch the engine or install dependencies.

Drafts use a fresh ACP session, a private empty working directory, no MCP servers or client filesystem/terminal capabilities, an empty built-in tool allowlist, deny-all tool permission rules, and disabled memory, subagents, web search, compatibility scans, and automatic updates. Unexpected ACP permission requests are canceled; filesystem and terminal requests are rejected. User source text travels as a JSON-framed prompt, not command text. System instructions are capped at 40 KB, source prompts at 200 KB, completion configuration at 8,192 tokens (lower when requested), process output at 2 MiB, and generation at two minutes. No automatic inference retries occur. Provider behavior can still reject a requested token limit or plan access; errors leave the notebook unchanged.

Models come from the installed official engine's current catalog. The adapter does not invent selectable model names. Unauthenticated actual-binary validation covered installation integrity, version, ACP initialization, model discovery, device-link/code creation, and cancellation on Mac. Mocked tests cover generation framing, tool denial, cancel/timeout behavior, lifecycle races, and corrupt downloads. Successful account login and paid/subscription inference require the user's own authorized account and are not claimed by those tests.

Primary implementation references:

- [Grok Build overview](https://docs.x.ai/build/overview)
- [CLI reference and device login](https://docs.x.ai/build/cli/reference)
- [ACP and headless integration](https://docs.x.ai/build/cli/headless-scripting)
- [Private GROK_HOME, feature switches, and permission configuration](https://docs.x.ai/build/settings/reference)
- [Official installer artifact locations](https://x.ai/cli/install.sh)
