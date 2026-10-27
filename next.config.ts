import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit reads its built-in font metrics from its package directory at runtime.
  serverExternalPackages: ["pdfkit"],
  // Going back to a screen seen in the last 30 seconds shows it at once instead
  // of reloading it. Saving anything (server actions) clears this, so edits
  // always show straight away.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  // Shared report links carry their token in the URL: don't leak it to other
  // sites through the Referer header, and keep the pages out of search engines.
  async headers() {
    return [
      {
        source: "/r/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
