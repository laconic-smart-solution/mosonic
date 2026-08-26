/** Parse stored pipeline node `output` JSON into a plain object. */
export function parsePipelineNodeOutputString(
  output: string | Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (output == null) return null;
  if (typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }
  if (typeof output !== 'string') {
    return { output: String(output) };
  }
  try {
    const parsed = JSON.parse(output) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { output: String(parsed) };
  } catch {
    return { output: output ?? '' };
  }
}

/** Reconstruct nodeOutputs from materialized pipeline execution records. */
export function buildNodeOutputMapFromPipeline(
  nodes: unknown,
): Record<string, Record<string, unknown>> {
  if (!Array.isArray(nodes)) return {};
  const nodeOutputs: Record<string, Record<string, unknown>> = {};
  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') continue;
    const node = raw as {
      nodeId?: string;
      output?: string | Record<string, unknown> | null;
    };
    if (!node.nodeId) continue;
    const parsed = parsePipelineNodeOutputString(node.output ?? null);
    if (parsed && Object.keys(parsed).length > 0) {
      nodeOutputs[node.nodeId] = parsed;
    }
  }
  return nodeOutputs;
}
