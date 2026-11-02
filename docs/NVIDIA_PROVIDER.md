# NVIDIA free-endpoint setup

Open **Settings → Model provider**, enter your own NVIDIA Developer API key and select **Save provider**. Leaving **Apply recommended models to all seven agents** selected assigns the models below without changing prompts or other agent settings. The key field is blank on reload; a blank save keeps the existing key. Show/hide, replacement and removal controls are available. A saved change applies without restarting the worker.

No key supplied in a conversation is embedded or automatically installed. Each installation accepts its own key. Keys are saved atomically with owner-only permissions in `FORGE_DATA_DIR/provider-credentials.json`, excluded from Git even under a custom data directory. Snapshots, API responses, diagnostics and model prompts contain no credentials. A deliberately requested connection test makes one short model call and verifies structured tool-call output without executing a tool.

| Agent     | Recommended free endpoint                |
| --------- | ---------------------------------------- |
| Lead      | `nvidia/nemotron-3-ultra-550b-a55b`      |
| Architect | `deepseek-ai/deepseek-v4.1-flash`        |
| Builder   | `deepseek-ai/deepseek-v4.1-flash`        |
| Frame     | `nvidia/nemotron-3.5-super-vl-120b-a12b` |
| Scenic    | `nvidia/nemotron-3.5-super-vl-120b-a12b` |
| Balance   | `nvidia/nemotron-3.5-lightning-30b-a3b`  |
| Tester    | `nvidia/nemotron-3-ultra-550b-a55b`      |

These assignments are role-based recommendations, not comparative benchmark claims. They use coding-oriented models for implementation, vision-capable models for interface/world work and a different model family for independent testing.

The public catalog and **Free Endpoint** pages were checked on 2026-11-02: [Nemotron 3 Ultra](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b), [DeepSeek V4.1 Flash](https://build.nvidia.com/deepseek-ai/deepseek-v4.1-flash), [Nemotron 3.5 Super VL](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b), [Nemotron 3.5 Lightning](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b). A catalog listing alone does not prove free availability: the earlier Nemotron 3 Super model is still listed but its free endpoint is deprecated, so it is excluded.

Calls are restricted to this allowlist and `https://integrate.api.nvidia.com/v1`. The setup offers no paid-provider selection, partner endpoint URL or automatic paid fallback. A rejected, unavailable or rate-limited model fails rather than switching services. NVIDIA controls trial availability and limits; see its [Developer Program FAQ](https://docs.api.nvidia.com/nim/docs/product).

## Usage and existing data

Actual token usage is recorded when returned. An absent cost is stored as unknown (`NULL`), not as a free-price estimate. Missing streamed usage is marked unavailable while preserving a valid completed answer. The UI reports trial token usage and labels unreported costs in the ledger. Existing historical USD totals and priced-call reservation logic are preserved, but the free NIM path does not pretend to enforce a dollar limit from an unpublished price catalog.

The NVIDIA adapter requests streamed tool-call deltas and usage, retaining existing orchestration, approval gates and task persistence. Recommended Nemotron models disable private thinking in their request template; private reasoning fields are never displayed. Applying a provider configuration is blocked while operations are active. Removing a key also pauses the team and disables environment-key fallback for that provider on this installation.

For unattended deployment, `.env.example` contains optional blank `NVIDIA_API_KEY`, `MODEL_PROVIDER=nvidia` and `NVIDIA_TOKEN_ONLY=true` settings. Manual entry in Settings is preferred. An explicit legacy `MODEL_PROVIDER=openrouter` environment configuration is retained for existing priced-provider deployments; the free NVIDIA setup never chooses it or falls back to it.

Verification covers private credential storage, masking/retention/rotation/removal, unchanged prompts, free-model allowlisting, no paid fallback, missing NIM usage fields and legacy budget accounting. Browser checks use a synthetic key, never an actual credential.
