// Smoke test for the deployed backend. Usage:
//   BASE=http://localhost:10000 DEMO_PASSWORD=... ADMIN_PASSWORD=... node deploy/render/smoke.mjs
import { createRequire } from "node:module";

const require = createRequire(new URL("../../socket/package.json", import.meta.url));
const { io } = require("socket.io-client");

const BASE = process.env.BASE || "http://localhost:10000";
const ORIGIN = process.env.ORIGIN || "http://localhost:5173";
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(ok ? "OK  " : "FAIL", name, ok ? "" : extra);
};
const call = async (path, { token, method = "GET", body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Origin: ORIGIN,
      ...(body && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text: text.slice(0, 300), headers: res.headers };
};
const connect = (token) =>
  new Promise((resolve) => {
    const s = io(BASE, { transports: ["websocket"], auth: token ? { token } : {}, reconnection: false, forceNew: true });
    s.events = [];
    s.onAny((e, d) => s.events.push([e, d]));
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e) => { s.failure = e.message; resolve(s); });
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const health = await call("/api/health");
check("health", health.status === 200, health.text);
check("cors", health.headers.get("access-control-allow-origin") === ORIGIN);

const feed = await call("/api/posts");
check("feed has demo posts", feed.status === 200 && feed.json?.data?.length > 0, feed.text);
for (const path of ["/api/search?q=DOCKER", "/api/search?q=%23react", "/api/trending", "/api/leaderboard", "/api/tags", "/api/sitemap"]) {
  const r = await call(path);
  check(`GET ${path}`, r.status === 200, `${r.status} ${r.text}`);
}

const signUp = await call("/api/register", {
  method: "POST",
  body: { name: "x", username: "smoke_x", email: "smoke@example.com", password: "Password123!", password_confirmation: "Password123!" },
});
check("registration is closed", signUp.status === 403, `${signUp.status} ${signUp.text}`);

const bad = await call("/api/login", { method: "POST", body: { email: "admin@codex.com", password: "password" } });
check("default password rejected", bad.status === 401, `${bad.status}`);

const admin = await call("/api/login", { method: "POST", body: { email: "admin@codex.com", password: process.env.ADMIN_PASSWORD } });
const adminToken = admin.json?.data?.token;
check("admin login", admin.status === 200 && adminToken, admin.text);
for (const path of ["/api/admin/stats", "/api/admin/users?search=ADMIN", "/api/me"]) {
  const r = await call(path, { token: adminToken });
  check(`admin GET ${path}`, r.status === 200, `${r.status} ${r.text}`);
}

const users = await call("/api/admin/users?per_page=50", { token: adminToken });
const list = users.json?.data?.data ?? users.json?.data ?? [];
const people = (Array.isArray(list) ? list : []).filter((u) => u.email !== "admin@codex.com" && u.email_verified_at && !u.is_blocked);
check("demo users listed", people.length >= 2, users.text);

if (people.length >= 2) {
  const login = async (u) =>
    (await call("/api/login", { method: "POST", body: { email: u.email, password: process.env.DEMO_PASSWORD } })).json?.data?.token;
  const [a, b] = people;
  const [ta, tb] = [await login(a), await login(b)];
  check("demo logins", ta && tb);

  const post = await call("/api/posts", { token: ta, method: "POST", body: { content: "Smoke test", type: "news", tags: ["smoke"] } });
  const postId = post.json?.data?.id;
  check("create post", post.status === 201 && postId, `${post.status} ${post.text}`);

  const [sa, sb, anon, fake] = await Promise.all([connect(ta), connect(tb), connect(null), connect("fake")]);
  check("socket auth", sa.connected && sb.connected && anon.connected && fake.failure === "Unauthorized");
  anon.emit("join", { userId: a.id });
  await wait(500);

  for (const type of ["like", "bookmark"]) {
    const r = await call("/api/interactions", { token: tb, method: "POST", body: { interactable_type: "post", interactable_id: postId, type } });
    check(`${type} post`, r.status < 300, `${r.status} ${r.text}`);
  }
  await wait(1500);
  check("real-time event through Redis", sa.events.length > 0);
  check("anonymous socket gets nothing private", anon.events.length === 0);

  for (const path of ["/api/liked", "/api/bookmarks", "/api/chat/conversations", "/api/notifications", "/api/groups"]) {
    const r = await call(path, { token: tb });
    check(`GET ${path}`, r.status === 200, `${r.status} ${r.text}`);
  }
  await call(`/api/posts/${postId}`, { token: ta, method: "DELETE" });
  for (const s of [sa, sb, anon, fake]) s.close();
}

for (const path of ["/storage/justificantes/x.pdf", "/storage/center_requests/x.pdf", "/.env"]) {
  const r = await call(path);
  check(`blocked ${path}`, r.status === 404, `${r.status}`);
}

console.log(failed ? `${failed} checks failed` : "All checks passed");
process.exit(failed ? 1 : 0);
