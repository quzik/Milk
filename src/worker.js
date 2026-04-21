export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- HELPERS ----------
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    const getCookie = (req, name) => {
      const cookie = req.headers.get("Cookie") || "";
      const match = cookie.match(new RegExp(`${name}=([^;]+)`));
      return match ? match[1] : null;
    };

    const getUser = async (req) => {
      const token = getCookie(req, "session");
      if (!token) return null;

      // Sessions expire after 24 hours
      const s = await env.DB.prepare(
        `SELECT user_id FROM sessions
         WHERE token = ?
         AND created_at > datetime('now', '-1 day')`
      ).bind(token).first();

      return s?.user_id || null;
    };

    const hashPassword = async (password) => {
      const encoded = new TextEncoder().encode(password);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    };

    try {

      // ---------- LOGIN ----------
      if (url.pathname === "/login" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body?.username || !body?.password) {
          return json({ error: "Missing credentials" }, 400);
        }

        const { username, password } = body;

        // Fetch user by username only — never compare password in SQL
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ?"
        ).bind(username).first();

        if (!user) {
          return json({ error: "Invalid credentials" }, 401);
        }

        const hashed = await hashPassword(password);
        if (hashed !== user.password_hash) {
          return json({ error: "Invalid credentials" }, 401);
        }

        const token = crypto.randomUUID();

        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, datetime('now'))"
        ).bind(token, user.id).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`
          }
        });
      }

      // ---------- LOGOUT ----------
      if (url.pathname === "/logout" && request.method === "POST") {
        const token = getCookie(request, "session");
        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?")
            .bind(token).run();
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
          }
        });
      }

      // ---------- CUSTOMERS ----------
      if (url.pathname === "/customers" && request.method === "GET") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const { results } = await env.DB.prepare(
          "SELECT id, name FROM customers WHERE user_id = ?"
        ).bind(uid).all();

        return json(results);
      }

      if (url.pathname === "/customer" && request.method === "POST") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => null);
        if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
          return json({ error: "Invalid customer name" }, 400);
        }

        const name = body.name.trim().slice(0, 100);

        const res = await env.DB.prepare(
          "INSERT INTO customers (name, user_id) VALUES (?, ?)"
        ).bind(name, uid).run();

        return json({ id: res.meta.last_row_id });
      }

      // ---------- SAVE ----------
      if (url.pathname === "/save" && request.method === "POST") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => null);
        if (!body?.month || !Array.isArray(body.rows)) {
          return json({ error: "Invalid request body" }, 400);
        }

        const { month, rows } = body;

        // Only delete entries that belong to this user's customers
        await env.DB.prepare(`
          DELETE FROM entries
          WHERE month = ?
          AND customer_id IN (SELECT id FROM customers WHERE user_id = ?)
        `).bind(month, uid).run();

        if (rows.length > 0) {
          const stmt = env.DB.prepare(`
            INSERT INTO entries (customer_id, month, qty, rate, old_balance, received, days)
            VALUES (?, ?, ?, ?, 0, 0, ?)
          `);

          // Verify each customer_id belongs to the authenticated user before inserting
          const ownedCustomers = await env.DB.prepare(
            "SELECT id FROM customers WHERE user_id = ?"
          ).bind(uid).all();

          const ownedIds = new Set(ownedCustomers.results.map(c => String(c.id)));

          const batch = rows
            .filter(r => ownedIds.has(String(r.customer_id)))
            .map(r =>
              stmt.bind(
                r.customer_id,
                month,
                Number(r.qty) || 0,
                Number(r.rate) || 0,
                JSON.stringify(r.days || [])
              )
            );

          if (batch.length > 0) {
            await env.DB.batch(batch);
          }
        }

        return json({ success: true });
      }

      // ---------- LOAD ----------
      if (url.pathname === "/load" && request.method === "GET") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const month = url.searchParams.get("month");
        if (!month) return json({ error: "Missing month" }, 400);

        const { results } = await env.DB.prepare(`
          SELECT e.id, e.customer_id, e.month, e.qty, e.rate,
                 e.old_balance, e.received, e.days, c.name
          FROM entries e
          JOIN customers c ON e.customer_id = c.id
          WHERE e.month = ? AND c.user_id = ?
        `).bind(month, uid).all();

        return json(results);
      }

      // ---------- ANALYTICS ----------
      if (url.pathname === "/analytics" && request.method === "GET") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const { results } = await env.DB.prepare(`
          SELECT
            e.month,
            SUM(e.qty * e.rate * json_array_length(e.days)) AS revenue,
            SUM(e.received) AS received
          FROM entries e
          JOIN customers c ON e.customer_id = c.id
          WHERE c.user_id = ?
          GROUP BY e.month
          ORDER BY e.month
        `).bind(uid).all();

        return json(results);
      }

      // ---------- SERVE UI ----------
      return env.ASSETS.fetch(request);

    } catch (err) {
      // Never leak internal error details to the client
      console.error(err);
      return json({ error: "Internal server error" }, 500);
    }
  }
};
