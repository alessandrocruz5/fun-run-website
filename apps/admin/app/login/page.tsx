import { Button } from "@rr/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInAsDemo } from "@/lib/auth/demo-login";
import { getDemoCredentials, signIn } from "@/lib/auth/server";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS = {
  invalid: "That email and password don't match an organizer account.",
  rate_limited: "Too many sign-in attempts. Wait a minute, then try again.",
  unavailable: "Sign-in isn't available right now. Try again in a moment.",
  demo_unavailable: "The demo isn't available right now. Try again later.",
} as const;

type ErrorKey = keyof typeof ERRORS;

function isErrorKey(value: unknown): value is ErrorKey {
  return typeof value === "string" && Object.hasOwn(ERRORS, value);
}

async function signInWithPassword(formData: FormData) {
  "use server";
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    redirect("/login?error=invalid");
  }
  const outcome = await signIn({ email, password });
  redirect(outcome === "signed_in" ? "/" : `/login?error=${outcome}`);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (await getSession()) redirect("/");
  // `error` only picks one of the fixed messages above: nothing from the URL is rendered.
  const { error } = await searchParams;
  const message = isErrorKey(error) ? ERRORS[error] : null;
  const demoAvailable = getDemoCredentials() !== null;

  return (
    <main className="mx-auto flex max-w-[480px] flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <p className="mono m-0">RIVERLINE RUN · ORGANIZER</p>
        <h1 className="disp text-4xl">Sign in</h1>
      </div>

      {message && (
        <p role="alert" className="m-0 rounded-input bg-error-bg px-4 py-3 text-sm text-error">
          {message}
        </p>
      )}

      <section aria-labelledby="demo-heading" className="flex flex-col gap-3">
        <h2 id="demo-heading" className="m-0 text-lg font-semibold">
          New here?
        </h2>
        <p className="m-0 text-sm">
          See the dashboard as a viewer, with test registrations. Runners&apos; contact details are
          masked.
        </p>
        <form action={signInAsDemo}>
          <Button type="submit" variant="accent" size="md" disabled={!demoAvailable}>
            Explore the organizer demo
          </Button>
        </form>
      </section>

      <section aria-labelledby="organizer-heading" className="flex flex-col gap-4">
        <h2 id="organizer-heading" className="m-0 text-lg font-semibold">
          Organizer account
        </h2>
        <form action={signInWithPassword} className="flex flex-col gap-4">
          <label className="input">
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="input">
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div>
            <Button type="submit" variant="dark" size="md">
              Sign in
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
