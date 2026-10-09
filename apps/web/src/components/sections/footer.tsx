import Link from "next/link";
import { SITE } from "@/content/site";

export function Footer() {
  return (
    <footer className="dark">
      <div className="wrap footer-inner">
        <span className="brand">RIVERLINE RUN</span>
        <div className="flex flex-col gap-1.5 opacity-80">
          <span>
            A {SITE.organizer} event · {SITE.city} · {SITE.raceDayShort}
          </span>
          <span>
            Riverline Run and the {SITE.organizer} are fictional. A portfolio project: payments run
            in test mode only.
          </span>
          <Link href="/privacy">Privacy notice</Link>
        </div>
      </div>
    </footer>
  );
}
