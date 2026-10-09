import type { Metadata } from "next";
import { Cause } from "@/components/sections/cause";
import { Hero } from "@/components/sections/hero";
import { Kit } from "@/components/sections/kit";
import { Register } from "@/components/sections/register";
import { Routes } from "@/components/sections/routes";
import { ScrollEffects } from "@/components/sections/scroll-effects";
import { getRaceViews } from "@/content/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const races = getRaceViews();

  return (
    <>
      <ScrollEffects />
      <main>
        <Hero races={races} />
        <Routes races={races} initial="21k" />
        <Kit races={races} />
        <Cause />
        <Register races={races} />
      </main>
    </>
  );
}
