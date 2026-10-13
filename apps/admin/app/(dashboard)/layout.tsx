import { Button } from "@rr/ui";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { endSession, requireSession } from "@/lib/auth/session";

async function signOut() {
  "use server";
  await endSession();
  redirect("/login");
}

/**
 * Every page except /login renders inside this layout, which redirects to /login when signed out.
 * Pages and data functions call `requireSession()` again: a layout doesn't re-run on client-side
 * navigation.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b-2 border-ink px-4 py-4 sm:px-7">
        <p className="disp m-0 text-xl [font-stretch:110%]">Riverline Run · Organizer</p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-sm">
            <span className="font-semibold">{session.name}</span>
            <span aria-hidden="true"> · </span>
            <span className="mono uppercase">{session.role}</span>
          </p>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
