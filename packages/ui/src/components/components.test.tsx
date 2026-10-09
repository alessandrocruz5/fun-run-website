import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Button, ButtonLink } from "../index";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toMatch(/^<button type="button"/);
  });

  it("keeps an explicit submit type", () => {
    expect(renderToStaticMarkup(<Button type="submit">Pay</Button>)).toContain('type="submit"');
  });

  it("applies the variant and appends extra classes", () => {
    const html = renderToStaticMarkup(
      <Button variant="accent" className="w-full">
        Go
      </Button>,
    );
    expect(html).toContain("bg-accent");
    expect(html).toContain("w-full");
  });
});

describe("ButtonLink", () => {
  it("renders an anchor with the href", () => {
    const html = renderToStaticMarkup(<ButtonLink href="#register">Register</ButtonLink>);
    expect(html).toMatch(/^<a class="[^"]*border-ink[^"]*" href="#register">Register<\/a>$/);
  });
});

describe("Badge", () => {
  it("renders a span with the variant classes", () => {
    const html = renderToStaticMarkup(<Badge variant="tag">TEST</Badge>);
    expect(html).toMatch(/^<span class="[^"]*bg-accent[^"]*">TEST<\/span>$/);
  });
});
