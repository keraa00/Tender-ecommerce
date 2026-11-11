/**
 * Up to two letters standing in for an account in the header menu: the first
 * letters of the first and last names, or the start of the email when there is
 * no name. Uppercased in the user's own script rather than assuming ASCII.
 */
export function initialsFor(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);

  if (words.length > 0) {
    const first = firstLetter(words[0]);
    const last = words.length > 1 ? firstLetter(words[words.length - 1]) : "";
    return (first + last).toLocaleUpperCase();
  }

  return firstLetter(email).toLocaleUpperCase() || "?";
}

/** The first user-perceived character — so "Đorđe" gives "Đ", not half of it. */
function firstLetter(word: string): string {
  return Array.from(word)[0] ?? "";
}

/** The name to greet someone by, falling back to their email. */
export function displayName(name: string | null | undefined, email: string): string {
  return name?.trim() || email;
}
