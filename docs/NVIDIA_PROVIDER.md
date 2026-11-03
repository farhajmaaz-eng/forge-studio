# Optional NVIDIA provider

OpenRouter is now the primary provider. Follow [OpenRouter setup](OPENROUTER_SETUP.md) for migration and startup instructions.

To deliberately retain NVIDIA, select **NVIDIA NIM (optional)** in Settings → Model provider, enter your own key (or configure `NVIDIA_API_KEY` on the server), apply its recommended models, and save. The NVIDIA adapter retains its free-endpoint allowlist, fixed `https://integrate.api.nvidia.com/v1` URL and token-only usage tracking when no price is reported. It never falls back to OpenRouter. Historical NVIDIA records are preserved.

Its built-in models are `nvidia/nemotron-3-ultra-550b-a55b`, `deepseek-ai/deepseek-v4.1-flash`, `nvidia/nemotron-3.5-super-vl-120b-a12b` and `nvidia/nemotron-3.5-lightning-30b-a3b`. Their free-endpoint pages were checked on 2026-11-02. NVIDIA controls availability and developer limits; see its [Developer Program FAQ](https://docs.api.nvidia.com/nim/docs/product). A catalog entry does not guarantee continued free availability.

Keys remain private server-side data. They are not embedded, logged, returned in snapshots, or transferred between providers. Each installation uses its own credentials.
