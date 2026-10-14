import { NextResponse, type NextRequest } from "next/server";

/*
 * Keeps Task Create out of route interception. The @drawer slot intercepts
 * /personal/tasks/:id (P06 drawer), and Next's interception rewrite matches
 * any segment there, the static "create" included. Interception only happens
 * for client navigations, which carry the Next-Url header; dropping it for
 * this one path lets ordinary route matching serve the Task Create page
 * (P05) on soft navigation too. Proxy runs before those rewrites.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("next-url");
  return NextResponse.next({ request: { headers } });
}

// Matchers must be literals (statically analysed): keep equal to TASK_CREATE_HREF.
export const config = {
  matcher: ["/personal/tasks/create"],
};
