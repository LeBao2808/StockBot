import { NextResponse, type NextRequest } from "next/server";

// The dashboard shows real DNSE account data, so it must not be public.
// - STOCKMATE_DASHBOARD_PASSWORD set: every page and API (except /api/mcp,
//   which has its own bearer token) asks for HTTP Basic auth.
// - Not set: allowed locally, but on Vercel the account endpoints refuse.

function sameString(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const password = process.env.STOCKMATE_DASHBOARD_PASSWORD;
  const { pathname } = request.nextUrl;

  if (!password) {
    if (process.env.VERCEL && pathname.startsWith("/api/dnse")) {
      return NextResponse.json(
        { error: "Đặt STOCKMATE_DASHBOARD_PASSWORD trước khi mở dữ liệu tài khoản DNSE trên máy chủ công khai." },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (sameString(supplied, password)) return NextResponse.next();
    } catch {
      // Malformed header: fall through to the challenge.
    }
  }
  return new NextResponse("Cần đăng nhập để xem Stockmate.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Stockmate", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/mcp|_next/static|_next/image|favicon.ico).*)"],
};
