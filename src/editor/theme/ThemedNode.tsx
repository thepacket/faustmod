import { useState } from "react";
import { Presets as ReactPresets } from "rete-react-plugin";
import type { ClassicPreset } from "rete";
import { accentFor } from "./accents";
import { WidgetBody } from "../widgets/WidgetBody";
import { ResizeHandle } from "../widgets/ResizeHandle";
import { WidgetBridge, type WidgetNode } from "../widgets/WidgetBridge";

// Ref components from the classic preset — they register each socket/control with
// the render pipeline so connection positions are tracked. Using them keeps node
// behavior identical to the default; only the surrounding markup/styling changes.
const { RefSocket, RefControl } = ReactPresets.classic;

type Entry<T> = [string, T | undefined];

function sortByIndex<T extends { index?: number }>(entries: Entry<T>[]) {
  entries.sort((a, b) => (a[1]?.index ?? 0) - (b[1]?.index ?? 0));
}

interface NodeData extends ClassicPreset.Node {
  componentId?: string;
  category?: string;
  selected?: boolean;
  tooltip?: string;
  tips?: Record<string, string>;
  widget?: string;
  widgetConfig?: Record<string, unknown>;
  widgetState?: Record<string, unknown>;
  resizable?: boolean;
  width?: number;
  height?: number;
}

interface Props {
  data: NodeData;
  emit: (...args: any[]) => any;
  styles?: () => any;
}

export function ThemedNode(props: Props) {
  const { id, label, inputs, outputs, controls, componentId, category, selected, tooltip, tips } =
    props.data;
  const tip = (key: string) => tips?.[key];
  const isConstant = componentId === "constant";
  const inputEntries = Object.entries(inputs) as Entry<any>[];
  const outputEntries = Object.entries(outputs) as Entry<any>[];
  const controlEntries = Object.entries(controls) as Entry<any>[];
  sortByIndex(inputEntries);
  sortByIndex(outputEntries);
  sortByIndex(controlEntries);

  const hasInputs = inputEntries.some(([, v]) => v);
  const hasOutputs = outputEntries.some(([, v]) => v);
  const isWidget = !!props.data.widget;

  // Inline title rename: click the title (a click, not a drag) to edit it.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label ?? "");
  const commitRename = () => {
    (props.data as { label?: string }).label = draft.trim() || label || "";
    setEditing(false);
    WidgetBridge.updateNode(id);
    WidgetBridge.onChange();
  };

  const inputPort = ([key, input]: Entry<any>) =>
    input && (
      <div className="dsp-port dsp-input" key={key} data-testid={`input-${key}`} title={tip(key)}>
        <RefSocket
          name="input-socket"
          side="input"
          socketKey={key}
          nodeId={id}
          emit={props.emit}
          payload={input.socket}
        />
        <span className="dsp-port-label">{input.label}</span>
      </div>
    );
  const outputPort = ([key, output]: Entry<any>) =>
    output && (
      <div className="dsp-port dsp-output" key={key} data-testid={`output-${key}`} title={tip(key)}>
        <span className="dsp-port-label">{output.label}</span>
        <RefSocket
          name="output-socket"
          side="output"
          socketKey={key}
          nodeId={id}
          emit={props.emit}
          payload={output.socket}
        />
      </div>
    );

  return (
    <div
      className="dsp-node"
      data-testid="node"
      data-category={category ?? ""}
      data-constant={isConstant ? "true" : undefined}
      data-widget={isWidget ? "true" : undefined}
      data-widget-kind={props.data.widget || undefined}
      data-selected={selected ? "true" : undefined}
      title={isConstant ? tooltip : undefined}
      style={{ ["--accent" as string]: accentFor(category ?? "") }}
    >
      {!isConstant &&
        (editing ? (
          <input
            className="dsp-title dsp-title-edit"
            value={draft}
            autoFocus
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <div
            className="dsp-title"
            data-testid="title"
            title={tooltip}
            onClick={() => {
              setDraft(label ?? "");
              setEditing(true);
            }}
          >
            {label}
          </div>
        ))}

      {/* Constant: a small titleless box — value field beside its output socket. */}
      {isConstant && (
        <div className="dsp-const">
          {controlEntries.map(
            ([key, control]) =>
              control && (
                <RefControl
                  key={key}
                  name="control"
                  emit={props.emit}
                  payload={control}
                  data-testid={`control-${key}`}
                />
              ),
          )}
          {outputEntries.map(
            ([key, output]) =>
              output && (
                <div
                  className="dsp-port dsp-output"
                  key={key}
                  data-testid={`output-${key}`}
                  title={tip(key)}
                >
                  <RefSocket
                    name="output-socket"
                    side="output"
                    socketKey={key}
                    nodeId={id}
                    emit={props.emit}
                    payload={output.socket}
                  />
                </div>
              ),
          )}
        </div>
      )}

      {/* Widget: inputs (left) · custom body · outputs (right), optionally resizable. */}
      {isWidget && (
        <div className="dsp-widget-row">
          {hasInputs && <div className="dsp-col dsp-inputs">{inputEntries.map(inputPort)}</div>}
          <div className="dsp-widget-body">
            <WidgetBody node={props.data as unknown as WidgetNode} />
          </div>
          {hasOutputs && <div className="dsp-col dsp-outputs">{outputEntries.map(outputPort)}</div>}
          {props.data.resizable &&
            (props.data.widgetConfig?.square ? (
              <ResizeHandle
                node={props.data as unknown as WidgetNode}
                square
                minW={90}
                minH={90}
              />
            ) : (
              <ResizeHandle node={props.data as unknown as WidgetNode} />
            ))}
        </div>
      )}

      {!isConstant && !isWidget && (hasInputs || hasOutputs) && (
        <div className="dsp-io">
          {hasInputs && (
            <div className="dsp-col dsp-inputs">
              {inputEntries.map(
                ([key, input]) =>
                  input && (
                    <div
                      className="dsp-port dsp-input"
                      key={key}
                      data-testid={`input-${key}`}
                      title={tip(key)}
                    >
                      <RefSocket
                        name="input-socket"
                        side="input"
                        socketKey={key}
                        nodeId={id}
                        emit={props.emit}
                        payload={input.socket}
                      />
                      <span className="dsp-port-label">{input.label}</span>
                    </div>
                  ),
              )}
            </div>
          )}

          {hasOutputs && (
            <div className="dsp-col dsp-outputs">
              {outputEntries.map(
                ([key, output]) =>
                  output && (
                    <div
                      className="dsp-port dsp-output"
                      key={key}
                      data-testid={`output-${key}`}
                      title={tip(key)}
                    >
                      <span className="dsp-port-label">{output.label}</span>
                      <RefSocket
                        name="output-socket"
                        side="output"
                        socketKey={key}
                        nodeId={id}
                        emit={props.emit}
                        payload={output.socket}
                      />
                    </div>
                  ),
              )}
            </div>
          )}
        </div>
      )}

      {!isConstant && !isWidget && controlEntries.length > 0 && (
        <div className="dsp-controls">
          {controlEntries.map(
            ([key, control]) =>
              control && (
                <RefControl
                  key={key}
                  name="control"
                  emit={props.emit}
                  payload={control}
                  data-testid={`control-${key}`}
                />
              ),
          )}
        </div>
      )}
    </div>
  );
}
