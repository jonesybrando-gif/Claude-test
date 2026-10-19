import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Coarse gate: unauthenticated requests go to /login. Fine-grained role and
// client checks happen server-side in every page and action (src/server/access.ts).
export async function middleware(req: NextRequest) {
  const token = req.cookies.get("pm_session")?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // r/ = shared report links (token-checked in the page and route themselves).
  matcher: ["/((?!$|privacy|terms|setup|login|accept-invite|reset-password|forgot-password|api/cron|r/|_next/static|_next/image|favicon.ico).*)"],
};
