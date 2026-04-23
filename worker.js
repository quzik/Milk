export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // DYNAMIC CORS — must reflect exact origin (not "*") when credentials are used
    const allowedOrigins = env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
      : [];

    const corsOrigin =
      allowedOrigins.length === 0 || allowedOrigins.includes(origin)
        ? origin || "*"
        : allowedOrigins[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",  // ← FIX: tell caches this varies by origin
    };

    // Helper to return JSON with CORS
    const json = (data, status = 200, extraHeaders = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          ...extraHeaders,
        },
      });

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Cookie & Auth Helpers ──────────────────────────────────────────────────

    // FIX: was returning the full regex match array instead of the captured value
    const getCookie = (req, name) => {
      const cookieHeader = req.headers.get("Cookie") || "";
      const match = cookieHeader.match(
        new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
      );
      return match ? match[1] : null;  // ← FIX: return match[1] (the value), not match (the array)
    };

    const getUser = async (req) => {
      const token = getCookie(req, "session");
      if (!token) return null;
      const s = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token = ?"
      )
        .bind(token)
        .first();
      return s?.user_id || null;
    };

    try {
      // ── LOGIN ────────────────────────────────────────────────────────────────
      if (url.pathname === "/login" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const { username, password } = body;

        if (!username || !password) {
          return json({ error: "Username and password are required" }, 400);
        }

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ? AND password = ?"
        )
          .bind(username, password)
          .first();

        if (!user) return json({ error: "Invalid credentials" }, 401);

        // FIX: delete any existing sessions for this user to avoid stale tokens
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?")
          .bind(user.id)
          .run();

        const token = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, datetime('now'))"
        )
          .bind(token, user.id)
          .run();

        // SameSite=None + Secure required for cross-domain cookies in Chrome
        const cookie = `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=604800`;
        return json(
          { success: true, user: { id: user.id, username: user.username } },
          200,
          { "Set-Cookie": cookie }
        );
      }

      // ── LOGOUT ───────────────────────────────────────────────────────────────
      if (url.pathname === "/logout") {
        const token = getCookie(request, "session");  // now correctly returns the token string
        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?")
            .bind(token)
            .run();
        }
        return json({ success: true }, 200, {
          "Set-Cookie":
            "session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None",
        });
      }

      // ── AUTH GUARD ───────────────────────────────────────────────────────────
      const uid = await getUser(request);
      if (!uid) return json({ error: "Unauthorized" }, 401);

      // ── CUSTOMER CRUD ────────────────────────────────────────────────────────
      if (url.pathname === "/customers" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM customers WHERE user_id = ? ORDER BY name ASC"
        )
          .bind(uid)
          .all();
        return json(results);
      }

      if (url.pathname === "/customer" && request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const { name, rate } = body;
        if (!name?.trim()) return json({ error: "Name is required" }, 400);

        const res = await env.DB.prepare(
          "INSERT INTO customers (name, default_rate, user_id) VALUES (?, ?, ?)"
        )
          .bind(name.trim(), Number(rate) || 50, uid)
          .run();
        return json({ id: res.meta.last_row_id });
      }

      if (url.pathname === "/customer" && request.method === "PUT") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const { id, name, rate } = body;
        if (!id) return json({ error: "Customer id is required" }, 400);

        await env.DB.prepare(
          "UPDATE customers SET name = ?, default_rate = ? WHERE id = ? AND user_id = ?"
        )
          .bind(name, Number(rate) || 50, id, uid)
          .run();
        return json({ success: true });
      }

      if (url.pathname === "/customer" && request.method === "DELETE") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const { id } = body;
        if (!id) return json({ error: "Customer id is required" }, 400);

        // FIX: wrap in batch — both deletes run atomically
        await env.DB.batch([
          env.DB.prepare("DELETE FROM customers WHERE id = ? AND user_id = ?").bind(id, uid),
          env.DB.prepare("DELETE FROM entries WHERE customer_id = ?").bind(id),
        ]);
        return json({ success: true });
      }

      // ── DATA LOAD / SAVE ─────────────────────────────────────────────────────
      if (url.pathname === "/load" && request.method === "GET") {
        const month = url.searchParams.get("month");
        if (!month) return json({ error: "month param required" }, 400);

        const { results } = await env.DB.prepare(
          `SELECT e.* FROM entries e
           JOIN customers c ON e.customer_id = c.id
           WHERE e.month = ? AND c.user_id = ?`
        )
          .bind(month, uid)
          .all();
        return json(results);
      }

      if (url.pathname === "/save" && request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const { month, rows } = body;
        if (!month) return json({ error: "month is required" }, 400);

        // Delete existing entries for this month (only this user's customers)
        await env.DB.prepare(
          `DELETE FROM entries
           WHERE month = ?
           AND customer_id IN (SELECT id FROM customers WHERE user_id = ?)`
        )
          .bind(month, uid)
          .run();

        if (rows?.length > 0) {
          const stmt = env.DB.prepare(
            "INSERT INTO entries (customer_id, month, qty, rate, days, old_balance, received) VALUES (?, ?, ?, ?, ?, ?, ?)"
          );
          await env.DB.batch(
            rows.map((r) =>
              stmt.bind(
                r.customer_id,
                month,
                r.qty,
                r.rate,
                JSON.stringify(r.days),
                r.old_balance,
                r.received
              )
            )
          );
        }
        return json({ success: true });
      }

      // ── STATIC ASSETS fallback ───────────────────────────────────────────────
      return env.ASSETS
        ? await env.ASSETS.fetch(request)
        : json({ error: "Not Found" }, 404);

    } catch (err) {
      console.error("Worker error:", err);
      return json({ error: "Server Error", details: err.message }, 500);
    }
  },
};
