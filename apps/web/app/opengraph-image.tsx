import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getRaceView, getRaceViews, getSiteUrl, lowestPrice, SITE } from "@/content/site";

export const alt = `${SITE.name} ${SITE.edition}: run the riverline. ${SITE.testModeNotice}.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// SITE_URL is read per request, never at build time.
export const dynamic = "force-dynamic";

const INK = "#10233A";
const PAPER = "#F3EFE6";
const ACCENT = "#FF5A1F";

function loadFont(file: string) {
  return readFile(join(process.cwd(), "public/fonts", file));
}

export default async function Image() {
  const host = new URL(getSiteUrl()).host;
  const [archivo, archivoExt, mono] = await Promise.all([
    loadFont("archivo-900.woff"),
    // Latin-ext carries ₱, which the other two lack; it is last in each font stack.
    loadFont("archivo-900-latin-ext.woff"),
    loadFont("jetbrains-mono-600.woff"),
  ]);
  const races = getRaceViews();
  const full = getRaceView("42k");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: INK,
        color: PAPER,
        fontFamily: "JetBrains Mono, Archivo Ext",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
          background: ACCENT,
          color: INK,
          fontSize: 22,
          padding: "14px 0",
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 999, background: INK }} />
        {SITE.testModeNotice.toUpperCase()}
      </div>
      <div style={{ display: "flex", flex: 1, padding: "48px 64px 44px" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontFamily: "Archivo, Archivo Ext", fontSize: 30 }}>
            RIVERLINE RUN
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 34,
              fontFamily: "Archivo, Archivo Ext",
              fontSize: 108,
              lineHeight: 0.88,
              letterSpacing: -4,
            }}
          >
            <span>RUN THE</span>
            <span style={{ display: "flex" }}>
              <span style={{ color: ACCENT }}>RIVER</span>LINE.
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 40, fontSize: 22 }}>
            {[SITE.raceDay, SITE.venue].map((text) => (
              <span
                key={text}
                style={{ border: `2px solid ${PAPER}`, borderRadius: 999, padding: "8px 16px" }}
              >
                {text.toUpperCase()}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "auto", fontSize: 24, color: ACCENT }}>
            {`${races.map((r) => r.distanceShort).join(" · ")}  ·  FROM ${lowestPrice()}`}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <svg width="380" height="300" viewBox="0 0 600 460">
            <path
              d="M-20 130 C120 100 200 210 320 220 S520 310 640 340"
              fill="none"
              stroke="#1E4466"
              strokeWidth="56"
              strokeLinecap="round"
            />
            <path
              d={full.path}
              transform="translate(0 10)"
              fill="none"
              stroke={ACCENT}
              strokeWidth="9"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx="300" cy="238" r="15" fill={PAPER} />
            <circle cx="300" cy="238" r="7" fill={INK} />
          </svg>
          <div style={{ display: "flex", marginTop: "auto", fontSize: 22, opacity: 0.8 }}>
            {host}
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Archivo", data: archivo, weight: 900, style: "normal" },
        { name: "Archivo Ext", data: archivoExt, weight: 900, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 600, style: "normal" },
      ],
    },
  );
}
