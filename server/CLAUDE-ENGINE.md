# Local Claude Code connection

Asterloom optionally downloads and runs the unmodified official Claude Code native executable. The user signs in through that executable's own browser flow; the app never collects an OAuth token, reads a credentials file, proxies provider authentication, or bills for provider usage. The maintainer must satisfy Anthropic's applicable commercial hosting terms. The integration does not represent Anthropic endorsement.

The pinned release is **2.1.285**, from the official stable channel inspected on 2026-10-04. Mac Apple Silicon, Mac Intel and Windows x64 downloads have exact byte lengths and SHA-256 pins. Installation is an explicit action, streams the download, verifies before activation, and leaves system PATH unchanged. The release manifest's detached OpenPGP signature is verified in the regression test against Anthropic's published key fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`; the retained public manifest/signature/key let CI repeat this without a live keyserver. Executables remain byte-for-byte vendor artifacts. No shell installer runs. Git is optional in the current native Windows CLI and the drafting path uses no shell tools.

Both `CLAUDE_CONFIG_DIR` and `ANTHROPIC_CONFIG_DIR` point inside the app's private engine account directory. The second matters because keyless Console profiles normally live outside the Claude configuration directory. Subscription credentials remain provider-owned, including the CLI's per-directory macOS Keychain entry. Asterloom does not import environment API keys, tokens, proxies or existing profiles. Disconnect invokes the provider's own `auth logout`; it never removes another installation. Account files, engine executables and transient drafting instructions are not exported with notebooks.

The adapter offers subscription, Console and organization SSO login through the CLI's normal commands. No authentication method is patched out of the binary. For drafting, `--safe-mode` suppresses customizations while preserving authentication. **Do not substitute `--bare`: in this pinned CLI it disables OAuth and Keychain authentication.** Status calls the official `auth status` command and exposes only bounded public state, never account identifiers or secret output. A saved sign-in does not prove a live model entitlement.

The model picker contains the official CLI aliases `default`, `sonnet`, `opus`, `haiku` and `fable`. It marks them as aliases, not an authenticated entitlement catalog. The executable chooses the current version and checks account access. Fable may use usage credits and is labeled accordingly.

Drafting uses one noninteractive turn, stdin for source data, a private temporary system-instruction file, safe mode, restricted mode, no tools, no MCP servers, no permission prompts, no slash commands and no session persistence. Prompts are limited to 200 KB, system instructions to 40 KB, process output to 2 MiB and execution to two minutes. The CLI's documented output-token environment setting is capped at 8,192 and automatic retry settings are zero. Partial, failed, tool-denied and truncated responses do not become drafts. Cancellation terminates the child process and stale callbacks cannot reconnect the app.

Actual Mac checks covered verified app-managed installation, official version/help flags, private unauthenticated status, browser sign-in URL creation and cancellation. Tests exercise mocked authenticated generation, all login selections, result rejection, profile mismatch and lifecycle races. Successful account sign-in and inference require the user's own account and have not been claimed by these checks. Windows and Intel pins are vendor-signed-manifest verified; actual platform execution remains a separate native validation requirement.

Primary sources:

- [Claude Code hosting and authentication conditions](https://code.claude.com/docs/en/legal-and-compliance)
- [Native installation and signature verification](https://code.claude.com/docs/en/setup)
- [Authentication and multiple accounts](https://code.claude.com/docs/en/authentication)
- [Anthropic profile directory resolution](https://platform.claude.com/docs/en/manage-claude/wif-reference)
- [CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Documented environment settings](https://code.claude.com/docs/en/env-vars)
- [Model aliases](https://code.claude.com/docs/en/model-config)
- [Official release manifest](https://downloads.claude.ai/claude-code-releases/2.1.285/manifest.json)
