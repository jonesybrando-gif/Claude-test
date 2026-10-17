import { describe, expect, it } from "vitest";
import { csvCell, minorToDecimal, slug, toCsv } from "../csv";

describe("csv", () => {
  it("quotes and escapes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('Brand "Quotes"')).toBe('"Brand ""Quotes"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("yes");
  });

  it("neutralises formula injection in text but not in numbers", () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell("+1 campaign")).toBe("'+1 campaign");
    expect(csvCell("-Brand")).toBe("'-Brand");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("writes a BOM and CRLF rows", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a,b\r\n1,x\r\n");
  });

  it("converts minor units exactly", () => {
    expect(minorToDecimal(12345)).toBe(123.45);
    expect(minorToDecimal(-5)).toBe(-0.05);
    expect(minorToDecimal(29)).toBe(0.29);
    expect(minorToDecimal(null)).toBeNull();
  });

  it("makes safe file names", () => {
    expect(slug("Bright Smile Orthodontics")).toBe("bright-smile-orthodontics");
    expect(slug("Roofing Co. / ../etc")).toBe("roofing-co-etc");
    expect(slug("***")).toBe("report");
  });
});

import { formatMoneyCompact } from "../money";
import { pdfText } from "../../server/pdf/primitives";

describe("formatting for charts and PDFs", () => {
  it("compact money", () => {
    expect(formatMoneyCompact(0)).toBe("$0");
    expect(formatMoneyCompact(1250000)).toBe("$12.5K");
  });
  it("maps characters the PDF font can't draw", () => {
    expect(pdfText("Reduce from ≈$200 to ≈$118 → now ▲ 3% “quoted”")).toBe('Reduce from ~$200 to ~$118 -> now + 3% "quoted"');
    expect(pdfText("Café · 50 × 2 – ok")).toBe("Café · 50 × 2 – ok");
    expect(pdfText("emoji 🚀 gone")).toBe("emoji  gone");
  });
});
