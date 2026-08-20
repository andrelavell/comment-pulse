import type { Config, Context } from "@netlify/functions";
// @ts-ignore -- shared JS module
import { service, GraphError } from "../../server/service.js";
// @ts-ignore -- shared JS module
import { authEnabled, checkPassword, makeAuthCookie, isAuthed } from "../../server/auth.js";
// @ts-ignore -- shared JS module
import { sweepKey } from "../../server/sweep-key.js";

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = req.method;
  const body = method === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    if (method === "POST" && path === "/login") {
      if (!checkPassword(body.password)) return json({ error: "Wrong password" }, 401);
      return json({ ok: true }, 200, { "Set-Cookie": makeAuthCookie() });
    }

    if (authEnabled() && !isAuthed(req.headers.get("cookie"))) {
      return json({ error: "Sign in required", authRequired: true }, 401);
    }

    if (method === "GET" && path === "/bootstrap") {
      // Cold start with no index yet: kick off the background sweep and let
      // the UI poll until it's ready, instead of timing out this function.
      const existing = await service.bootstrap({ allowBuild: false });
      if (existing.building) {
        await fetch(`${url.origin}/.netlify/functions/sweep-background`, {
          method: "POST",
          headers: { "x-sweep-key": sweepKey() },
        });
        return json({ building: true });
      }
      // staleness is refreshed by the 15-minute sweep, not inline here
      return json(existing);
    }

    if (method === "GET" && path === "/comments") {
      const pageId = url.searchParams.get("pageId");
      if (!pageId) return json({ error: "pageId required" }, 400);
      return json(await service.comments(pageId, { force: url.searchParams.get("force") === "1" }));
    }

    let m: RegExpMatchArray | null;

    if (method === "GET" && path === "/overview") return json(await service.overview());
    if (method === "GET" && path === "/feedback") return json(await service.listFeedback());
    if (method === "POST" && path === "/feedback") {
      return json(await service.addFeedback(body.highlight, body.feedback));
    }
    if ((m = path.match(/^\/feedback\/([^/]+)$/)) && method === "DELETE") {
      return json(await service.deleteFeedback(m[1]));
    }
    if (method === "GET" && path === "/settings") return json(await service.getSettings());
    if (method === "POST" && path === "/settings") return json(await service.saveSettings(body));
    if (method === "POST" && path === "/review") {
      return json(await service.review(body.commentIds, body.reviewed));
    }

    if ((m = path.match(/^\/comments\/([^/]+)\/reply$/)) && method === "POST") {
      return json(await service.reply(m[1], body.pageId, body.message));
    }
    if ((m = path.match(/^\/comments\/([^/]+)\/ai-draft$/)) && method === "POST") {
      return json(await service.aiDraft(m[1], body.pageId));
    }
    if ((m = path.match(/^\/comments\/([^/]+)\/hide$/)) && method === "POST") {
      return json(await service.hide(m[1], body.pageId, body.hidden));
    }
    if ((m = path.match(/^\/comments\/([^/]+)\/like$/)) && method === "POST") {
      return json(await service.like(m[1], body.pageId, body.liked));
    }
    if ((m = path.match(/^\/comments\/([^/]+)$/)) && method === "DELETE") {
      return json(await service.remove(m[1], url.searchParams.get("pageId")));
    }
    if ((m = path.match(/^\/pages\/([^/]+)\/ban$/)) && method === "POST") {
      return json(await service.ban(m[1], body.userId, body.banned));
    }

    return json({ error: "Not found" }, 404);
  } catch (e: any) {
    const status = e instanceof GraphError && e.status >= 400 ? e.status : 500;
    console.error(e.message);
    return json({ error: e.message, code: e.fb?.code }, status);
  }
};

export const config: Config = {
  path: "/api/*",
};
