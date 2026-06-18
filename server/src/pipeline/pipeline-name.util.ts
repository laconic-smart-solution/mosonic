export function defaultPipelineName(
  contentPrompt: string,
  startedAt: Date = new Date(),
): string {
  const trimmed = contentPrompt.trim();
  if (trimmed) {
    return trimmed.slice(0, 64);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Run ${startedAt.getFullYear()}-${pad(startedAt.getMonth() + 1)}-${pad(startedAt.getDate())} ${pad(startedAt.getHours())}:${pad(startedAt.getMinutes())}`;
}
