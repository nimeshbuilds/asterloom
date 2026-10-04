# Provider connections, checked 4 October 2026

AI is optional authoring assistance. The app can send a selected exact passage
for one structured activity draft, prepared recall cards for wording refinement,
or a constrained image brief. Structural, evidence and solvability checks run
locally; every generative output still needs author review. The downloaded
semantic encoder finds relevant evidence locally and is not a generative model.

## Working API path

OpenAI, Claude/Anthropic, xAI and compatible endpoints have request-scoped keys,
current `/models` discovery, explicit model selection and manual-ID fallback.
Claude pagination is bounded and validated. Discovery performs no generation.
Models returned by a catalog are not a guarantee that every model supports every
operation or that a paid inference request will succeed. Provider errors are
redacted; credentials never enter notebooks, exports or progress backups.

OpenAI API text generation uses Responses; compatible/xAI uses chat completions;
Anthropic uses Messages. Existing image generation uses the image API and a
separate model selection. No external CLI dependencies are required for these
API paths. Local compatible servers must already expose a supported endpoint;
Asterloom does not silently install or operate an arbitrary model server.

## Subscription readiness and external prerequisites

The app contains the documented Sign in with ChatGPT OAuth flow: loopback
127.0.0.1 callback, PKCE S256, per-attempt state/nonce, dynamically issued client
ID, signed ID-token validation against OpenAI JWKS, required granted scope,
stable local host ID, refresh and disconnect. Desktop storage uses Electron
safeStorage encryption and rejects plaintext fallback. The browser companion
uses session memory. In-flight sign-ins cannot reconnect after disconnect.

The route is **disabled by default**. Only an eligible/approved distribution may
set `ASTERLOOM_CHATGPT_PLAN_ENABLED=1`. No provider approval was obtained in this
build. OpenAI's documentation describes an available local/open-source flow and
selected commercial/private integrations; a paid Asterloom release must obtain
its appropriate approval. Legacy Codex app-server authentication is explicitly
not permitted for commercial/hosted services, so it is not used as a workaround.

Subscription inference uses the public `/v1/responses` endpoint with `store:false`
and `stream:true`, succeeds only at `response.completed`, and does not enable
agent tools. Its current preview forbids `max_output_tokens`; the UI therefore
states that the output limit is controlled by the provider. Input and response
sizes, timeout and lack of automatic retries bound app behavior, not billed token
usage. Image generation is not supported through this subscription route.

Claude documentation still states third-party `claude.ai` login/rate-limit offers
need prior approval, despite a support article discussing ongoing Agent SDK
subscription usage. This build follows the integration policy and offers API or
explicit assistant transfer. Grok CLI browser sign-in exists, but no general
third-party subscription authorization for Asterloom was verified; xAI API keys
and transfer are supported. There are no pretend login buttons, scraped cookies,
borrowed official-client identifiers or imported credentials from other apps.

## Sources

- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://developers.openai.com/siwc/website
- https://learn.chatgpt.com/docs/app-server (Auth endpoints)
- https://code.claude.com/docs/en/agent-sdk/overview
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- https://platform.claude.com/docs/en/api/http/models
- https://docs.x.ai/developers/rest-api-reference/inference
- https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/02-authentication.md

Mocked protocol and end-to-end UI tests establish implementation behavior, not
successful sign-in, account eligibility, paid inference, or provider approval.
