// Model IDs verified against NVIDIA's public catalog on 2026-11-02.
// Recommendations are choices for these roles, not benchmark claims.
export const nvidiaAgentModels = {
  Lead: {
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    reason: "Planning, delegation and tool-driven coordination",
  },
  Architect: {
    model: "deepseek-ai/deepseek-v4.1-flash",
    reason: "System design and code-context analysis",
  },
  Builder: {
    model: "deepseek-ai/deepseek-v4.1-flash",
    reason: "Implementation and multi-step coding tools",
  },
  Frame: {
    model: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    reason: "Interface implementation and visual context",
  },
  Scenic: {
    model: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    reason: "World-building scripts and visual context",
  },
  Balance: {
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    reason: "Economy calculations and progression analysis",
  },
  Tester: {
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    reason:
      "Independent verification using a different model family from Builder",
  },
} as const;

export const nvidiaFreeModelIds: string[] = [
  ...new Set(Object.values(nvidiaAgentModels).map((p) => p.model)),
];

// Verified in OpenRouter's public catalog (tools supported) on 2026-11-03.
export const openRouterAgentModels = Object.fromEntries(
  Object.keys(nvidiaAgentModels).map((name) => [
    name,
    {
      model: "deepseek/deepseek-v4.1-flash",
      reason:
        "Low-cost tool-capable coding and planning; independently configurable per agent",
    },
  ]),
) as Record<keyof typeof nvidiaAgentModels, { model: string; reason: string }>;
