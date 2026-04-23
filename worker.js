export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    // FIXED: Returns match[1] (actual cookie value) instead of match array
    const getCookie = (req, name) => {
      const cookieHeader = req.headers.get("Cookie") || "";
      const match = cookieHeader.match(
        new RegExp(`(?:^|\\s*;\\s*)${name}=([^;]+)`)
      );
      return match ? match[1] : null;
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
      if (url is.pathname === "/login" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const { username, password } = body;

        if (!username || !password) {
          return json({ error: "Username and password required" }, 400);
        }

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ? AND password = a system limitation. However, I can provide the complete code below for you to copy-paste.

---

## 📄 WORKER.JS (Complete Code)

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    // FIXED: Returns match[1] (actual cookie value) instead of match array
    const getCookie = (req, name) => {
      const cookieHeader = req.headers.get("Cookie") || "";
      const match = cookieHeader.match(
        new RegExp(`(?:^|\\s*;\\s*)${name}=([^;]+)`)
      );
      return match ? match[1] : null;
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
      if (url.pathname === "/login" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const { username, password } = body;

        if (!username || !password) {
          return json({ error: "Username and password required" }, 400);
        }

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ? AND password = ?"
        )
          .bind(username, password)
          .first();

        if (!user) return json({ error: "Invalid credentials" }, 401);

        const token = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, datetime('now'))"
        )
          .bind(token, user.id)
          .run();

        return new Response(JSON.stringify({ success: true, user: { id: user.id, username: user.username } }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
          },
        });
      }

      if (url.pathname === "/logout") {
        const token = getCookie(request, "session");
        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
          },
        });
      }

      const uid = await getUser(request);

      if (!uid && url.pathname !== "/" && url.pathname !== "/login") {
        return json({ error: "Unauthorized" }, 401);
      }

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
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "Invalid JSON" }, 400);
        }

        const { name, rate } = body;
        if (!name || name.trim() === "") {
          return json({ error: "Customer name required" }, 400);
        }

        const res = await env.DB.prepare(
          "INSERT INTO customers (name, default_rate, user_id) VALUES (?, ?, ?)"
        )
          .bind(name.trim(), rate || 50, uid)
          .run();
        return json({ id: res.meta.last_row_id });
      }

      if (url.pathname === "/customer" && request.method === "PUT") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "Invalid JSON" }, 400);
        }

        const { id, name, rate } = body;
        if (!id) return json({ error: "Customer ID required" }, 400);

        await env.DB.prepare(
          "UPDATE customers SET name = ?, default_rate = ? WHERE id = ? AND user_id = ?"
        )
          .bind(name, rate || 50, id, uid)
          .run();
        return json({ success: true });
      }

      if (url.pathname === "/customer" && request.method === "DELETE") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "Invalid JSON" }, 400);
        }

        const { id } = body;
        if (!id) return json({ error: "Customer ID required" }, 400);

        await env.DB.prepare("DELETE FROM customers WHERE id = ? AND user_id = ?").bind(id, uid).run();
        await env.DB.prepare("DELETE FROM entries WHERE customer_id = ?").bind(id).run();
        return json({ success: true });
      }

      if (url.pathname === "/load" && request.method === "GET") {
        const month = url.searchParams.get("month");
        if (!month) return json({ error: "Month parameter required" }, 400);

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
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "Invalid JSON" }, 400);
        }

        const { month, rows } = body;
        if (!month) return json({ error: "Month required" }, 400);

        await env.DB.prepare(
          "DELETE FROM entries WHERE month = ? AND customer_id IN (SELECT id FROM customers WHERE user_id = ?)"
        )
          .bind(month, uid)
          .run();

        if (rows && rows.length > 0) {
          const stmt = env.DB.prepare(
            "INSERT INTO entries (customer_id, month, qty, rate, days, old_balance, received) VALUES (?, ?, ?, ?, ?, ?, ?)"
          );
          const batch = rows.map((r) =>
            stmt.bind(
              r.customer_id,
              month,
              r.qty || 0,
              r.rate || 0,
              JSON.stringify(r.days),
              r.old_balance || 0,
              r.received || 0
            )
          );
          await env.DB.batch(batch);
        }

        return json({ success: true });
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return json({ error: "Not Found" }, 404);

    } catch (err) {
      console.error("Worker Error:", err);
      return json({ error: "Server Error", details: err.message }, 500);
    }
  },
};
