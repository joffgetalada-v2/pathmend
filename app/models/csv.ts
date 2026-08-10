import {
  normalizePath,
  validateRedirectInput,
} from "./redirects";

/**
 * Two-column redirect CSV parsing/serialization. Deliberately minimal: no
 * multi-line quoted fields (URLs can't contain newlines) and extra columns
 * are ignored, which tolerates exports from WordPress/Redirection and
 * BigCommerce that append type/code columns.
 */

export const DEFAULT_MAX_CSV_ROWS = 500;

export interface CsvRedirectRow {
  line: number;
  path: string;
  target: string;
}

export interface CsvRowError {
  line: number;
  message: string;
}

export interface ParsedRedirectCsv {
  rows: CsvRedirectRow[];
  errors: CsvRowError[];
}

const HEADER_ALIASES = new Set([
  "path,target",
  "from,to",
  "old_url,new_url",
  "source,destination",
]);

/** Splits one CSV line into fields, honoring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseRedirectCsv(
  text: string,
  options: { maxRows?: number } = {},
): ParsedRedirectCsv {
  const maxRows = options.maxRows ?? DEFAULT_MAX_CSV_ROWS;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  const numbered = lines
    .map((raw, index) => ({ line: index + 1, raw: raw.trim() }))
    .filter((entry) => entry.raw !== "");

  if (numbered.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  }

  const headerCandidate = splitCsvLine(numbered[0]!.raw)
    .slice(0, 2)
    .map((field) => field.trim().toLowerCase())
    .join(",");
  const dataEntries = HEADER_ALIASES.has(headerCandidate)
    ? numbered.slice(1)
    : numbered;

  if (dataEntries.length > maxRows) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `Too many rows — the limit is ${maxRows} per file. Split the file and import in batches.`,
        },
      ],
    };
  }

  const rows: CsvRedirectRow[] = [];
  const errors: CsvRowError[] = [];
  const seenPaths = new Map<string, number>();

  for (const entry of dataEntries) {
    const fields = splitCsvLine(entry.raw);
    const rawPath = (fields[0] ?? "").trim();
    const rawTarget = (fields[1] ?? "").trim();

    const rowErrors = validateRedirectInput({
      path: rawPath,
      target: rawTarget,
    });
    if (rowErrors.length > 0) {
      errors.push({ line: entry.line, message: rowErrors[0]!.message });
      continue;
    }

    const path = normalizePath(rawPath);
    // Canonicalize the dedupe key: Shopify matches redirect paths
    // case-insensitively, so "/DUP/" and "/dup" would collide at apply time.
    let duplicateKey = path.toLowerCase();
    if (duplicateKey.length > 1 && duplicateKey.endsWith("/")) {
      duplicateKey = duplicateKey.slice(0, -1);
    }
    const firstLine = seenPaths.get(duplicateKey);
    if (firstLine !== undefined) {
      errors.push({
        line: entry.line,
        message: `Duplicate of line ${firstLine} — the same path can only redirect once.`,
      });
      continue;
    }
    seenPaths.set(duplicateKey, entry.line);

    rows.push({ line: entry.line, path, target: rawTarget });
  }

  if (rows.length === 0 && errors.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  }

  return { rows, errors };
}

const escapeCsvField = (value: string): string => {
  // Formula guard: spreadsheet apps execute leading =+-@ as formulas, and
  // Excel also evaluates them after a leading tab or carriage return.
  const guarded = /^[\t\r=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
};

export function toRedirectCsv(
  rows: readonly { path: string; target: string }[],
): string {
  const lines = ["path,target"];
  for (const row of rows) {
    lines.push(`${escapeCsvField(row.path)},${escapeCsvField(row.target)}`);
  }
  return lines.join("\n");
}
