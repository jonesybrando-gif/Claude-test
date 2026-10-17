import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit reads its built-in font metrics from its package directory at runtime.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
