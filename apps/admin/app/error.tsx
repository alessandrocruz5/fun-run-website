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
    <main className="mx-auto flex max-w-[480px] flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-3">
        <p className="mono m-0">SOMETHING WENT WRONG</p>
        <h1 className="disp text-4xl">Something went wrong.</h1>
      </div>
      <p className="m-0 text-sm">
        Nothing was changed: the dashboard only reads registrations. Try again, or sign in again.
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
  );
}
