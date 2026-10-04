# Provider connections, checked 4 October 2026

AI is optional authoring assistance. Asterloom supplies selected exact source passages for activity drafts, wording refinement or an illustration brief. It validates structure, evidence references and bounded model rules locally; generative content remains subject to author review. The bundled semantic encoder retrieves evidence locally and does not generate answers.

## Official local tools

The personal desktop preview installs and runs the unmodified official tools in app-managed directories. Each tool owns its own sign-in, account credentials and subscription access. Asterloom does not extract an existing tool's credentials or ask for the provider password. The sign-in opens the official provider page. Installation verifies pinned artifact bytes before activation, requires no system Node/npm setup, and leaves system PATH unchanged.

| Tool | Pinned version | Integration | Model selection |
| --- | --- | --- | --- |
| Codex | 0.160.0 | Official app-server authentication and constrained turns | Official `model/list` catalog |
| Claude Code | 2.1.285 | Official native auth commands and a noninteractive, tool-disabled turn | Documented CLI aliases, explicitly labeled as aliases |
| Grok Build | 1.0.46 | Official device sign-in and Agent Client Protocol | Installed engine's current catalog |

Model discovery does not establish account entitlement. Claude's aliases resolve through its executable; Asterloom does not present them as a live account catalog. Grok's saved connection marker indicates a previous completed login, not newly verified subscription access. A completed provider turn is required to verify inference for a particular account/model.

The official engines keep private, separate account directories. Claude also uses its own configuration-specific macOS Keychain entry. These engine credentials are provider-managed, not encrypted by Asterloom's legacy OAuth store. They never enter notebooks, game packages or progress backups. Disconnect affects only the Asterloom-managed account. Auth callbacks, installation polls and model requests are invalidated on cancellation, disconnect, unmount or provider changes; stale results cannot silently reconnect or overwrite an API selection.

Drafts use bounded input/output, a single turn, no automatic inference retries, a private working directory, no filesystem/terminal/client tools, and no MCP servers. Provider token-limit behavior varies. Installation and browser authentication require network access; offline creation and play do not require these tools. Generated images remain on supported API routes rather than being promised for every subscription engine.

### Distribution conditions

The desktop manifest declares `personal-local`. OpenAI explicitly permits the documented app-server authentication for local/open-source applications and prohibits it in commercial/hosted services. A paid/hosted edition needs an approved Sign in with ChatGPT integration; this preview is not evidence of that approval. Asterloom retains its separate, disabled-by-default approved OAuth route for eligible distributions.

Anthropic's current hosting guidance explicitly permits an end user to sign in to an **unmodified Claude Code binary** with their own subscription, including on a hosted platform, subject to its applicable terms. This differs from using extracted Claude.ai credentials or implementing third-party Claude.ai authentication. Asterloom follows the unmodified-tool path and offers the CLI's subscription, Console and organization SSO methods.

Grok Build documents headless/ACP integration. Plan eligibility and limits remain with the user's xAI account. Asterloom does not promise that every Grok subscription has identical capabilities.

See [Claude implementation and provenance](../server/CLAUDE-ENGINE.md), [Grok implementation and provenance](../server/GROK-ENGINE.md) and the pinned Codex artifacts/licenses in `server/`.

## API keys and compatible servers

OpenAI, Anthropic, xAI and compatible endpoints use request-scoped keys, model discovery, explicit selection and manual-ID fallback. Anthropic pagination is bounded and validated. OpenAI uses Responses; compatible/xAI uses chat completions; Anthropic uses Messages. API credentials remain out of saved notebooks and exports. API access is separately billed by the provider and is not assumed to follow from a chat subscription. A compatible local model server must already expose a supported endpoint.

## Verification limits

Actual Mac binaries were installed and integrity-checked in isolated profiles. Verification exercised official version/protocol initialization, private unauthenticated status, provider-owned login URLs/device codes, cancellation, and Codex/Grok catalogs. A local fixture model also confirmed that Codex receives an empty tool set. Mocked service/UI tests exercise authenticated completion, denied tools, failure recovery, invalid catalogs and lifecycle races. These tests **do not establish successful account sign-in, subscription entitlement or live provider inference**. No account credentials or billable model calls were used for those checks.

## Primary sources

- [Codex app-server and authentication conditions](https://learn.chatgpt.com/docs/app-server)
- [Commercial Sign in with ChatGPT integration](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [Claude Code hosting and authentication conditions](https://code.claude.com/docs/en/legal-and-compliance)
- [Claude Code authentication](https://code.claude.com/docs/en/authentication)
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
- [Grok Build integration](https://docs.x.ai/build/overview)
- [Grok CLI device login](https://docs.x.ai/build/cli/reference)
- [Grok headless/ACP integration](https://docs.x.ai/build/cli/headless-scripting)
