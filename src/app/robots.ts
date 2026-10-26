import type { MetadataRoute } from "next";

// Only the public pages are meant for search engines; everything else needs a sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/privacy", "/terms"], disallow: "/" }],
    sitemap: "https://marketingnexus.us/sitemap.xml",
  };
}
