import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import {
  RegistrationConfirmed,
  type RegistrationConfirmedProps,
  registrationConfirmedSubject,
} from "../templates/registration-confirmed";

const DETAILS: RegistrationConfirmedProps = {
  eventName: "Riverline Run 2027",
  organizer: "Clearwater Collective",
  firstName: "Juana",
  fullName: "Juana Dela Cruz",
  raceLabel: "10K Run",
  reference: "RR-TEST0001",
  amount: "₱1,000",
  raceDay: "Sun · Apr 18, 2027",
  venue: "Port Meridian Waterfront",
  assemblyTime: "4:30 AM",
  gunTime: "5:00 AM",
  privacyUrl: "https://riverline.test/privacy",
  retentionDays: 7,
};

const REQUIRED = [
  ["name", "Juana Dela Cruz"],
  ["race", "10K Run"],
  ["reference", "RR-TEST0001"],
  ["amount", "₱1,000"],
  ["date", "Sun · Apr 18, 2027"],
  ["venue", "Port Meridian Waterfront"],
  ["assembly time", "4:30 AM"],
  ["gun time", "5:00 AM"],
] as const;

// HTML-escaped text is compared after decoding the few entities React writes.
function decode(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

describe("RegistrationConfirmed", () => {
  it.each(REQUIRED)("shows the %s in the HTML and the plain text", async (_field, text) => {
    const html = decode(await render(<RegistrationConfirmed {...DETAILS} />));
    const plain = await render(<RegistrationConfirmed {...DETAILS} />, { plainText: true });
    expect(html).toContain(text);
    expect(plain).toContain(text);
  });

  it("says the payment was a test and nothing was charged, in both versions", async () => {
    const html = decode(await render(<RegistrationConfirmed {...DETAILS} />));
    const plain = await render(<RegistrationConfirmed {...DETAILS} />, { plainText: true });
    for (const version of [html, plain]) {
      expect(version).toMatch(/test payment: nothing was charged/i);
      expect(version).toMatch(/fictional event/i);
    }
  });

  it("links the privacy notice and states the retention period", async () => {
    const html = await render(<RegistrationConfirmed {...DETAILS} />);
    const plain = await render(<RegistrationConfirmed {...DETAILS} />, { plainText: true });
    expect(html).toContain('href="https://riverline.test/privacy"');
    expect(plain).toContain("https://riverline.test/privacy");
    expect(plain).toContain("deleted within 7 days");
  });

  it("is a full HTML document, and the plain text carries no markup", async () => {
    const html = await render(<RegistrationConfirmed {...DETAILS} />);
    const plain = await render(<RegistrationConfirmed {...DETAILS} />, { plainText: true });
    expect(html).toMatch(/^<!DOCTYPE html/);
    expect(html).toContain('<html dir="ltr" lang="en">');
    expect(plain).not.toMatch(/<[a-z!/]/i);
  });

  it("escapes what the runner typed", async () => {
    const html = await render(
      <RegistrationConfirmed {...DETAILS} fullName={'<img src=x onerror="alert(1)">'} />,
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("registrationConfirmedSubject", () => {
  it("names the race and reference and is marked as a test", () => {
    expect(registrationConfirmedSubject(DETAILS)).toBe(
      "You're in: 10K Run, Riverline Run 2027 · RR-TEST0001 [TEST]",
    );
  });
});
