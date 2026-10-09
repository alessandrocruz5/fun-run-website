"use client";

import { ButtonLink } from "@rr/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { NAV_LINKS } from "@/content/site";

// Links come from the layout as props: a value import of content/site would ship zod and the
// env schema to the browser.
export function Header({ links }: { links: typeof NAV_LINKS }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="wrap hdr">
      <Link href="/" className="logo">
        <i aria-hidden="true">
          <b />
        </i>
        RIVERLINE RUN
      </Link>
      <ButtonLink href="/#register" variant="dark" size="sm" className="m-reg">
        Register
      </ButtonLink>
      <button
        type="button"
        className="menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
      </button>
      <nav id="site-nav" aria-label="Main" className={open ? "nav open" : "nav"}>
        {links.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
        <ButtonLink href="/#register" variant="dark" size="sm" className="nav-cta">
          Register
        </ButtonLink>
      </nav>
    </header>
  );
}
