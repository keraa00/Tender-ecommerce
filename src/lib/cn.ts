/**
 * Minimal className joiner. Not `clsx` + `tailwind-merge` — this project does
 * not have enough conditional-class churn to justify two more dependencies.
 */
export function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
