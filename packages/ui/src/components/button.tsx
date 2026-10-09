import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "accent" | "outline" | "dark" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center rounded-full leading-none text-center no-underline " +
  "transition-[translate,scale,background-color,color,box-shadow] duration-250 ease-riverline " +
  "hover:-translate-y-0.5 hover:shadow-lift active:scale-[.97] disabled:opacity-60 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0";

const variants: Record<ButtonVariant, string> = {
  accent: "border-2 border-accent bg-accent text-ink hover:text-ink focus-visible:outline-ink",
  outline: "border-2 border-ink bg-transparent text-ink hover:text-ink focus-visible:outline-ink",
  dark: "bg-ink text-paper hover:text-paper focus-visible:outline-accent",
  ghost:
    "border-2 border-paper bg-transparent text-paper hover:text-paper focus-visible:outline-accent",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-4 py-2.5 font-sans text-sm font-medium",
  md: "px-5 py-3.5 font-display text-[15px] font-bold",
  lg:
    "px-[26px] py-[18px] font-display text-base font-extrabold tracking-[.02em] [font-stretch:110%] " +
    "max-[860px]:px-5 max-[860px]:py-4 max-[860px]:text-[15px]",
};

/** Classes for a Riverline pill button, for elements other than `Button`/`ButtonLink`. */
export function buttonClassName({
  variant = "outline",
  size = "lg",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cx(base, variants[variant], sizes[size], className);
}

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize };

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: StyleProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClassName({ variant, size, className })} {...props} />
  );
}

/** A link styled as a button, e.g. an in-page `#register` call to action. */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: StyleProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a className={buttonClassName({ variant, size, className })} {...props} />;
}
