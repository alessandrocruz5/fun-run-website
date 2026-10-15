"use client";

import "./globals.css";
import { Button, ButtonLink } from "@rr/ui";

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
      <body className="min-h-dvh antialiased">
        <aside aria-label="Test mode" className="banner mono">
          <p className="m-0 leading-[1.4]">
            <span aria-hidden="true">● </span>
            Fictional event · Test mode, no real payments
          </p>
        </aside>
        <main className="mx-auto flex max-w-[480px] flex-col gap-6 px-4 py-12">
          <div className="flex flex-col gap-3">
            <p className="mono m-0">SOMETHING WENT WRONG</p>
            <h1 className="disp text-4xl">Something went wrong.</h1>
          </div>
          <p className="m-0 text-sm">
            Nothing was changed: the dashboard only reads registrations. Try again, or sign in
            again.
          </p>
          {error.digest ? <p className="mono m-0">Reference: {error.digest}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button variant="accent" size="md" onClick={() => retry()}>
              Try again
            </Button>
            <ButtonLink href="/" variant="outline" size="md">
              Back to the dashboard
            </ButtonLink>
          </div>
        </main>
      </body>
    </html>
  );
}
