/** Message key of a five-level mood (1 awful … 5 great), for the "moodLevel" select. */
export function moodKey(level: number): "awful" | "low" | "okay" | "good" | "great" {
  return (["awful", "low", "okay", "good", "great"] as const)[Math.min(5, Math.max(1, Math.round(level))) - 1]!;
}
