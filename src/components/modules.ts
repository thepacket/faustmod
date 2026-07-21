import type { ComponentDef } from "./library";
import generatedModules from "../generated/examples.json";

/**
 * Ported GRAME Faust example programs (see scripts/build-examples.mjs). These are
 * self-contained DSP modules: audio channels become signal ports and each Faust UI
 * param becomes a control input driving the worklet's AudioParam. They populate the
 * right-hand "Modules" palette, kept separate from the core left-hand library.
 */
export const MODULES: ComponentDef[] = generatedModules as ComponentDef[];

export const MODULES_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
