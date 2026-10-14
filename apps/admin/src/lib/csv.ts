/**
 * CSV for the registrations export (RFC 4180). A text cell that a spreadsheet would read as a
 * formula, one starting with `=`, `+`, `-` or `@` (or a tab or carriage return), gets a leading
 * `'` so it opens as text. Numbers are written as they are: they are never user text.
 */

export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A header and rows as CSV with CRLF line ends and a trailing newline. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
