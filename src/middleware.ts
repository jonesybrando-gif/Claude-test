import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Coarse gate: unauthenticated requests go to /login. Fine-grained role and
// client checks happen server-side in every page and action (src/server/access.ts).
export async function middleware(req: NextRequest) {
  // A custom report domain (REPORT_URL) only serves shared reports (/r/…, excluded
  // from this middleware); anything else there goes to the app's own address.
  if (process.env.REPORT_URL && process.env.APP_URL) {
    const reportHost = new URL(process.env.REPORT_URL).host;
    if (req.headers.get("host") === reportHost && reportHost !== new URL(process.env.APP_URL).host) {
      return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, process.env.APP_URL));
    }
  }
  const token = req.cookies.get("pm_session")?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  // Behind a proxy the request URL can be the internal address, so prefer APP_URL.
  const url = process.env.APP_URL ? new URL("/login", process.env.APP_URL) : req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // r/ = shared report links (token-checked in the page and route themselves).
  matcher: ["/((?!$|privacy|terms|setup|login|accept-invite|reset-password|forgot-password|api/cron|r/|_next/static|_next/image|favicon.ico).*)"],
};
