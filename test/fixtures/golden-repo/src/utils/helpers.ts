/**
 * Helper utilities — mix of used and unused exports.
 * Known characteristics:
 *   - formatDate is imported by handlers.ts (used)
 *   - unusedHelper is never imported anywhere (dead export)
 */

export function formatDate(date: Date, format: string): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return format
    .replace("YYYY", year)
    .replace("MM", month)
    .replace("DD", day)
    .replace("HH", hours)
    .replace("mm", minutes)
    .replace("ss", seconds);
}

export function unusedHelper(input: string): string {
  const words = input.split(/\s+/);
  const reversed = words.map((word) =>
    word.split("").reverse().join("")
  );
  return reversed.join(" ");
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}

export function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}
