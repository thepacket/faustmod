import { chat } from "./openrouter";
import { LibraryService } from "../components/LibraryService";
import type { GraphSnapshot } from "../editor/createEditor";

/** The shape the model is asked to emit (positions are computed here, not by the model). */
interface AiGraph {
  nodes: { id: string; componentId: string; value?: number }[];
  connections: {
    source: string;
    sourceOutput: string;
    target: string;
    targetInput: string;
  }[];
}

/** Build a compact catalog of components + their labelled input/output ports. */
function catalog(): string {
  return LibraryService.components
    .map((c) => {
      const ins =
        c.inputs
          .map((s, i) => {
            const d = s.default !== undefined ? ` =${s.default}` : "";
            const rng = s.min !== undefined ? ` (${s.min}..${s.max})` : "";
            return `in-${i}:${s.label}${d}${rng}`;
          })
          .join(", ") || "none";
      const outs =
        c.outputs.map((s, i) => `out-${i}:${s.label}`).join(", ") || "none";
      return `- ${c.id} ("${c.title}"): inputs=[${ins}] outputs=[${outs}]`;
    })
    .join("\n");
}

const SYSTEM = `You design modular audio synthesis patches for FaustMod.
You return ONLY a JSON object (no prose, no markdown fences) with this schema:
{
  "nodes": [{ "id": "unique-string", "componentId": "<from catalog>", "value": number }],
  "connections": [{ "source": "<node id>", "sourceOutput": "out-N", "target": "<node id>", "targetInput": "in-N" }]
}

The model:
- Nodes have INPUT PORTS and OUTPUT PORTS only — there are no inline parameters.
- An input labelled with "=X" is a CONTROL input with default X. If you leave it unconnected it uses X. To change it, add a "constant" node (set its "value") and connect the constant's out-0 into that control input.
- An input with no default is a signal input (silent when unconnected).
- The "constant" component is the ONLY node with a "value" field; every other value in the patch is produced by wiring nodes together.

Rules:
- Use ONLY componentId values from the catalog. Node "id" values are your own labels.
- Only connect an output port to an input port that both exist on their components (match the in-N / out-N indices from the catalog).
- Every audible patch MUST include an "output" node and route signal into its in-0 (L) and in-1 (R). Use "mono-to-stereo" to feed a mono source to both channels.
- Add "constant" nodes to set frequencies, cutoffs, gains, etc. via control inputs when you want values other than the defaults.
- Prefer small, clean patches that match the user's request.`;

/** Prompt the model and turn its response into a GraphSnapshot ready for editor.load. */
export async function generatePatch(userPrompt: string): Promise<GraphSnapshot> {
  const content = await chat([
    { role: "system", content: `${SYSTEM}\n\nComponent catalog:\n${catalog()}` },
    { role: "user", content: userPrompt },
  ]);

  const ai = parseJson(content);
  return toSnapshot(ai);
}

function parseJson(text: string): AiGraph {
  // Tolerate ```json fences or stray prose around the object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI response contained no JSON object");
  const obj = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(obj.nodes)) throw new Error("AI JSON missing nodes[]");
  obj.connections ??= [];
  return obj as AiGraph;
}

/** Assign a tidy left-to-right layered layout based on connection depth. */
function toSnapshot(ai: AiGraph): GraphSnapshot {
  const incoming = new Map<string, string[]>();
  for (const n of ai.nodes) incoming.set(n.id, []);
  for (const c of ai.connections) {
    if (incoming.has(c.target)) incoming.get(c.target)!.push(c.source);
  }

  const depth = new Map<string, number>();
  const computeDepth = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // break cycles
    seen.add(id);
    const preds = incoming.get(id) ?? [];
    const d = preds.length ? Math.max(...preds.map((p) => computeDepth(p, seen))) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const n of ai.nodes) computeDepth(n.id);

  const rowByCol = new Map<number, number>();
  const nodes: GraphSnapshot["nodes"] = ai.nodes.map((n) => {
    const col = depth.get(n.id) ?? 0;
    const row = rowByCol.get(col) ?? 0;
    rowByCol.set(col, row + 1);
    return {
      id: n.id,
      componentId: n.componentId,
      position: { x: col * 260 + 60, y: row * 170 + 60 },
      value: n.value,
    };
  });

  const connections: GraphSnapshot["connections"] = ai.connections.map((c, i) => ({
    id: `ai-conn-${i}`,
    source: c.source,
    sourceOutput: c.sourceOutput,
    target: c.target,
    targetInput: c.targetInput,
  }));

  return { nodes, connections };
}
