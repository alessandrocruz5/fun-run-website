"use client";

import { Button, ButtonLink } from "@rr/ui";

// Never render error.message or the stack: they can carry personal data. Only the digest, an
// opaque hash, is shown so the organizer can match it to server logs.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="wrap prose">
      <p className="mono">SOMETHING WENT WRONG</p>
      <h1 className="disp">We hit a snag.</h1>
      <p>
        Nothing was charged. If you were paying, your payment is safe: open the confirmation page
        again in a minute, or start over.
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
  );
}
