"use client";

import "./globals.css";
import { Button, ButtonLink } from "@rr/ui";
import { TestModeBanner } from "@/components/test-mode-banner";

// Replaces the root layout, so it brings its own document and the test-mode banner. It is
// prerendered without a CSP nonce, so it must read fine with no JS: the exit link is a plain
// anchor. Never render error.message or the stack.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <TestModeBanner />
        <main className="wrap prose">
          <p className="mono">SOMETHING WENT WRONG</p>
          <h1 className="disp">We hit a snag.</h1>
          <p>
            Nothing was charged. If you were paying, your payment is safe: open the confirmation
            page again in a minute, or start over.
          </p>
          {error.digest ? <p className="mono">Reference: {error.digest}</p> : null}
          <div className="row">
            <Button variant="accent" onClick={() => retry()}>
              TRY AGAIN
            </Button>
            <ButtonLink href="/" variant="outline">
              BACK TO THE START
            </ButtonLink>
          </div>
        </main>
      </body>
    </html>
  );
}
