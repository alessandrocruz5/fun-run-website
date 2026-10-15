import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "../error";
import GlobalError from "../global-error";

vi.mock("../globals.css", () => ({}));

const error = Object.assign(new Error("boom: juana@example.test"), { digest: "abc123" });

describe("error pages", () => {
  it("error page shows the digest, never the message", () => {
    const html = renderToStaticMarkup(<ErrorPage error={error} retry={() => {}} />);
    expect(html).toContain("Something went wrong.");
    expect(html).toContain("abc123");
    expect(html).not.toContain("boom");
    expect(html).not.toContain("juana@example.test");
  });

  it("global error renders its own document with the test-mode banner", () => {
    const html = renderToStaticMarkup(<GlobalError error={error} retry={() => {}} />);
    expect(html).toContain("<html");
    expect(html).toContain("Fictional event · Test mode, no real payments");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("boom");
    expect(html).not.toContain("juana@example.test");
  });
});
