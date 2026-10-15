import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getRaceView } from "@/content/site";
import { SEXES, SHIRT_SIZES } from "@/lib/registration/schema";
// The server's name for the honeypot, not the form's: renaming it on one side only fails here.
import { HONEYPOT_FIELD } from "@/lib/registration/turnstile";
import { RegistrationForm } from "../registration-form";

// `register` is a server action: the form only needs a function to post to.
vi.mock("@/lib/registration/actions", () => ({ register: vi.fn() }));

function render(turnstileSiteKey: string | null) {
  return renderToStaticMarkup(
    <RegistrationForm
      races={[getRaceView("10k"), getRaceView("21k")]}
      shirtSizes={SHIRT_SIZES}
      sexes={SEXES}
      initialRace="21k"
      turnstileSiteKey={turnstileSiteKey}
    />,
  );
}

describe("RegistrationForm", () => {
  it.each([
    ["with a site key", "1x00000000000000000000AA"],
    ["with registration paused", null],
  ])("renders the honeypot under the name the server checks, %s", (_case, siteKey) => {
    expect(render(siteKey)).toContain(`name="${HONEYPOT_FIELD}"`);
  });
});
