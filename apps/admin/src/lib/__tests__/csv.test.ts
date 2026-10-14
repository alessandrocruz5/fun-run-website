import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../csv";

describe("csvCell", () => {
  it.each(["=SUM(A1:A9)", "+63917", "-1+1", "@cmd", "\tcmd", "\rcmd"])(
    "escapes %j so a spreadsheet reads it as text",
    (value) => {
      const cell = csvCell(value);
      expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  it("escapes a formula that also needs quoting", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });

  it("leaves ordinary text alone, even with a formula character inside", () => {
    expect(csvCell("Juana")).toBe("Juana");
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("juana@example.com")).toBe("juana@example.com");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Dela Cruz, Juana")).toBe('"Dela Cruz, Juana"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("writes numbers as they are and null or undefined as empty", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(800)).toBe("800");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins a header and rows with CRLF and ends with a newline", () => {
    expect(
      toCsv(
        ["Name", "Email"],
        [
          ["Juana", "j@x"],
          ["=evil", null],
        ],
      ),
    ).toBe("Name,Email\r\nJuana,j@x\r\n'=evil,\r\n");
  });
});
