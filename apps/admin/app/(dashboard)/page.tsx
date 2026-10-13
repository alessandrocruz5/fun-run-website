import type { Metadata } from "next";
import { canSeePersonalData } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Overview" };

/** Placeholder until the overview lands (FRW-11). Like every page, it checks the session itself. */
export default async function OverviewPage() {
  const session = await requireSession();
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-10 sm:px-7">
      <h1 className="disp text-4xl">Overview</h1>
      <p className="m-0 max-w-[60ch]">
        {canSeePersonalData(session.role)
          ? "You see registrations in full."
          : "You're exploring the demo: runners' email, mobile, birthdate and emergency contact are masked."}
      </p>
      <p className="m-0 max-w-[60ch]">Registration totals and the runner list are coming next.</p>
    </main>
  );
}
