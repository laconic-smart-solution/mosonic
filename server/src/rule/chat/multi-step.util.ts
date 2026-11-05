/** Multi-step requests (a full campaign, brand + workflow + post in one message) get a hidden plan first. */
export function isMultiStepRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (/(full|whole|entire|complete) campaign|campaign plan|series of posts|\b\d+\s+posts\b/.test(t)) return true;
  const verbs = t.match(/\b(set ?up|create|make|build|add|remove|change|start|post|write|generate|schedule|apply)\b/g) ?? [];
  return new Set(verbs).size >= 3 || (verbs.length >= 2 && /\b(and then|then|after that|also)\b/.test(t));
}
