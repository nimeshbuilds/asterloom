# Security model

Imported notebooks contain data for trusted engines. Arbitrary notebook code, executable source media, scripts and provider credentials are rejected or excluded at serialization boundaries. Untrusted source text is never an instruction to a tool.

The companion binds loopback by default, checks Host/Origin, restricts website imports to public destinations, rejects unsafe archive paths and excessive expansion, limits request sizes and guards room capabilities. Native renderers use context isolation, sandboxing and a limited main-frame-only bridge.

Portable offline scores are self-reported. Signatures or possession of a room capability cannot prove honest play in a locally editable client. Do not use friendly rankings as certification evidence.

Keep originals and notebook/progress backups. Browser storage can be cleared by the browser or user. Native saved state uses an isolated application data directory; game exports carry no creator state or credentials.

Report security issues privately to the repository owner. No public submission endpoint is configured.
