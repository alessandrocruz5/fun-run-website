import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeVariant = "outline" | "accent" | "tag" | "paper";

const variants: Record<BadgeVariant, string> = {
  /** Date/location chips on paper. */
  outline:
    "rounded-full border-[1.5px] border-ink px-2.5 py-[7px] font-mono text-xs font-semibold " +
    "tracking-[.08em] max-[520px]:px-[9px] max-[520px]:py-1.5 max-[520px]:text-[10px]",
  /** "TEST TRANSACTIONS ONLY" pill. */
  accent: "rounded-full bg-accent px-3 py-2 font-mono text-xs font-semibold text-ink",
  /** Small square "TEST" tag. */
  tag: "rounded-tag bg-accent px-2 py-[5px] font-mono text-[10px] font-semibold text-ink",
  /** Distance names on the navy hero map. */
  paper:
    "rounded-full bg-paper px-3 py-2 font-display text-sm font-extrabold text-ink [font-stretch:120%]",
};

export function Badge({
  variant = "outline",
  className,
  ...props
}: { variant?: BadgeVariant } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx("inline-block leading-none", variants[variant], className)} {...props} />
  );
}
