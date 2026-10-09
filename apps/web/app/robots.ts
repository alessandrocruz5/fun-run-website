import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/content/site";

// SITE_URL is read per request, never at build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/register/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
