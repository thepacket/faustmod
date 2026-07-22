import type { ComponentDef } from "./library";

/**
 * The "modules" concept in code. The GRAME example modules were removed — user
 * modules ("User Defined DSP") now live in the custom-block registry (CustomBlocks),
 * so this list is empty. Kept for id resolution and the module naming.
 */
export const MODULES: ComponentDef[] = [];

export const MODULES_BY_ID = new Map<string, ComponentDef>(MODULES.map((m) => [m.id, m]));
