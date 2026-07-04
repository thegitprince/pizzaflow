// @ts-nocheck
// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public auth routes, assets, and APIs pass through directly
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/auth/confirm" ||
    pathname === "/staff/login" ||
    pathname === "/admin/login" ||
    pathname === "/signup"
  ) {
    return NextResponse.next();
  }

  // Redirect root / to /staff/login
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  // Setup the response object
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  // Guard against missing config during build/initialization
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
          });
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  // Retrieve current authenticated session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedStaffRoute = pathname.startsWith("/staff/") && pathname !== "/staff/login";
  const isProtectedAdminRoute = pathname.startsWith("/admin/");

  if (isProtectedStaffRoute || isProtectedAdminRoute) {
    // 1. If not logged in, always redirect to login page
    if (!user) {
      return NextResponse.redirect(new URL("/staff/login", request.url));
    }

    // 2. If accessing admin route, check role in profiles table
    if (isProtectedAdminRoute) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const role = profile?.role || user.user_metadata?.role || "staff";

      if (role !== "admin") {
        // Logged in but not an administrator: redirect to staff orders
        return NextResponse.redirect(new URL("/staff/order", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
