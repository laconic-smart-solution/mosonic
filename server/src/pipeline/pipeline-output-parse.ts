/** Parse stored pipeline node `output` JSON into a plain object. */
export function parsePipelineNodeOutputString(
  output: string | null,
): Record<string, unknown> | null {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : { output: String(parsed) };
  } catch {
    return { output: String(output ?? '') };
  }
}
