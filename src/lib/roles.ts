export const roles = {
  Lead: {
    color: "#b6a3ff",
    title: "Orchestrator",
    brief:
      "Own the request. Inspect the active game, clarify requirements in your deliverable, and delegate concrete, dependency-ordered tasks using delegate. Do not implement changes yourself. Delegate a final Tester task depending on every implementation task. Each task needs measurable acceptance criteria. Summarize the plan and risks.",
  },
  Architect: {
    color: "#7eacff",
    title: "Systems architect",
    brief:
      "Design Roblox client/server boundaries, module APIs, security, replication and persistence. Inspect existing scripts first. Produce actionable architecture and hand off implementation to Builder via handoff when needed.",
  },
  Builder: {
    color: "#ffc178",
    title: "Luau engineer",
    brief:
      "Implement production Luau. Inspect scripts before editing, validate remote input, use services correctly, avoid destructive replacements, and report exact paths changed. Use discovered MCP schemas.",
  },
  Frame: {
    color: "#f0a0d7",
    title: "Interface designer",
    brief:
      "Build responsive Roblox ScreenGui interfaces, accessibility, input feedback and device scaling. Inspect the hierarchy first and preserve existing UI.",
  },
  Scenic: {
    color: "#77d6bb",
    title: "World builder",
    brief:
      "Construct performant Roblox worlds, lighting and environments. Prefer anchored parts and organized models. Inspect the scene and preserve unrelated content.",
  },
  Balance: {
    color: "#e4d48a",
    title: "Economy designer",
    brief:
      "Design economy, rewards and progression without exploit-prone client authority. Inspect existing systems, document calculations and implement tuning where appropriate.",
  },
  Tester: {
    color: "#97bdf7",
    title: "Quality assurance",
    brief:
      "Independently verify acceptance criteria using actual Studio tool evidence. Inspect changed scripts, run playtests, collect console output and exercise player input. Never claim a pass from an implementation summary alone. Finish using verify with a boolean passed and detailed evidence; fail if Studio evidence is unavailable.",
  },
} as const;
export type Role = keyof typeof roles;
export const readers = [
  "list_roblox_studios",
  "script_read",
  "read_script",
  "get_script_source",
  "get_instance_tree",
  "get_instance_properties",
  "script_search",
  "script_grep",
  "search_game_tree",
  "inspect_instance",
  "get_studio_state",
  "get_console_output",
  "screen_capture",
  "http_get",
  "skill",
];
export const permissions: Record<Role, string[]> = {
  Lead: readers,
  Architect: readers,
  Builder: [...readers, "multi_edit", "execute_luau"],
  Frame: [
    ...readers,
    "multi_edit",
    "execute_luau",
    "search_asset",
    "insert_asset",
    "upload_image",
  ],
  Scenic: [
    ...readers,
    "execute_luau",
    "search_asset",
    "insert_asset",
    "generate_mesh",
    "generate_material",
    "generate_procedural_model",
    "wait_job_finished",
  ],
  Balance: [...readers, "multi_edit", "execute_luau"],
  Tester: [
    ...readers,
    "execute_luau",
    "start_stop_play",
    "character_navigation",
    "user_keyboard_input",
    "user_mouse_input",
  ],
};
// Arbitrary Luau execution can mutate a place even when phrased as a read.
export const isMutation = (name: string) => !readers.includes(name);
