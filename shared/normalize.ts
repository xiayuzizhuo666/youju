export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").replace(/[？?！!。.,，、\s]+$/u, "");
}
