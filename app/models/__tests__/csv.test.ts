import { describe, expect, test } from "vitest";

import { parseRedirectCsv, toRedirectCsv } from "../csv";

describe("parseRedirectCsv", () => {
  test("parses a simple path,target file with header", () => {
    const result = parseRedirectCsv("path,target\n/old,/new\n/old-2,/new-2\n");

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { line: 2, path: "/old", target: "/new" },
      { line: 3, path: "/old-2", target: "/new-2" },
    ]);
  });

  test("accepts from,to and old_url,new_url header variants", () => {
    expect(
      parseRedirectCsv("from,to\n/a,/b\n").rows,
    ).toHaveLength(1);
    expect(
      parseRedirectCsv("old_url,new_url\nhttps://old.com/a,/b\n").rows,
    ).toEqual([{ line: 2, path: "/a", target: "/b" }]);
  });

  test("treats a headerless file as data", () => {
    const result = parseRedirectCsv("/old,/new\n");
    expect(result.rows).toEqual([{ line: 1, path: "/old", target: "/new" }]);
  });

  test("handles quoted fields with commas and escaped quotes", () => {
    const result = parseRedirectCsv(
      'path,target\n"/search?q=a,b","/new"\n"/say-""hi""",/greeting\n',
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toEqual({
      line: 2,
      path: "/search?q=a,b",
      target: "/new",
    });
    expect(result.rows[1]?.path).toBe('/say-"hi"');
  });

  test("strips a UTF-8 BOM and tolerates CRLF line endings", () => {
    const result = parseRedirectCsv("﻿path,target\r\n/old,/new\r\n");
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 2, path: "/old", target: "/new" }]);
  });

  test("ignores extra columns beyond the first two", () => {
    const result = parseRedirectCsv("path,target,code\n/old,/new,301\n");
    expect(result.rows).toEqual([{ line: 2, path: "/old", target: "/new" }]);
  });

  test("reports invalid rows with line numbers and keeps going", () => {
    const result = parseRedirectCsv(
      "path,target\n/old,\n/ok,/fine\n/bad,//evil.com\n",
    );

    expect(result.rows).toEqual([{ line: 3, path: "/ok", target: "/fine" }]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[1]?.line).toBe(4);
  });

  test("flags duplicate paths within the file", () => {
    const result = parseRedirectCsv(
      "path,target\n/dup,/a\n/DUP/,/b\n",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/duplicate/i);
  });

  test("rejects files above the row cap with a single error", () => {
    const lines = ["path,target"];
    for (let i = 0; i < 10; i += 1) lines.push(`/p${i},/t`);
    const result = parseRedirectCsv(lines.join("\n"), { maxRows: 5 });

    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/5/);
  });

  test("rejects an empty file", () => {
    const result = parseRedirectCsv("  \n \n");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});

describe("toRedirectCsv", () => {
  test("emits a header and quotes fields that need it", () => {
    const csv = toRedirectCsv([
      { path: "/old", target: "/new" },
      { path: "/search?q=a,b", target: '/say-"hi"' },
    ]);

    expect(csv.split("\n")).toEqual([
      "path,target",
      "/old,/new",
      '"/search?q=a,b","/say-""hi"""',
    ]);
  });

  test("guards fields that spreadsheet apps would treat as formulas", () => {
    const csv = toRedirectCsv([{ path: "/x", target: "=HYPERLINK(1)" }]);
    expect(csv.split("\n")[1]).toBe("/x,'=HYPERLINK(1)");
  });

  test("guards whitespace-prefixed formulas too", () => {
    // Excel also evaluates formulas after a leading tab or CR; externally
    // created redirects can carry arbitrary strings into the export.
    const csv = toRedirectCsv([{ path: "/x", target: "\t=1+1" }]);
    expect(csv.split("\n")[1]).toBe("/x,'\t=1+1");
  });
});
