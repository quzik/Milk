export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // ---------- AUTH UTILITIES ----------
    const getCookie = (req, name) => {
      const match = (req.headers.get("Cookie") || "").match(
        new RegExp(`${name}=([^;]+)`)
      );
      return match ? match : null;
    };

    const getUser = async (req) => {
      const token = getCookie(req, "session");
      if (!token) return null;

      try {
        const s = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE token=?"
        )
          .bind(token)
          .first();
        return s?.user_id || null;
      } catch (e) {
        return null;
      }
    };

    try {
      // ================= LOGIN =================
      if (url.pathname === "/login" && request.method === "POST") {
        const { username, password } = await request.json();

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username=? AND password=?"
        )
          .bind(username, password)
          .first();

        if (!user) return json({ error: "Invalid login" }, 401);

        const token = crypto.randomUUID();

        // Save session to DB
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id) VALUES (?, ?)"
        )
          .bind(token, user.id)
          .run();

        // FIX: Removed 'Secure' and set 'SameSite=Lax' to prevent login loops
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
          },
        });
      }

      // ================= LOGOUT =================
      if (url.pathname === "/logout") {
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Set-Cookie": "session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
          },
        });
      }

      // ================= AUTH CHECK =================
      const uid = await getUser(request);

      // List of protected API routes
      const protectedPaths = ["/customers", "/customer", "/save", "/load", "/analytics"];
      
      if (!uid && protectedPaths.some(p => url.pathname.startsWith(p))) {
        return json({ error: "Unauthorized" }, 401);
      }

      // ================= CUSTOMERS =================
      if (url.pathname === "/customers" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM customers WHERE user_id=?"
        )
          .bind(uid)
          .all();
        return json(results);
      }

      if (url.pathname === "/customer" && request.method === "POST") {
        const { name, rate } = await request.json();
        if (!name) return json({ error: "Name required" }, 400);

        const res = await env.DB.prepare(
          "INSERT INTO customers (name, default_rate, user_id) VALUES (?, ?, ?)"
        )
          .bind(name, rate || 50, uid)
          .run();

        return json({ success: true, id: res.meta.last_row_id });
      }

      if (url.pathname === "/customer" && request.method === "DELETE") {
        const { id } = await request.json();
        await env.DB.prepare("DELETE FROM customers WHERE id=? AND user_id=?").bind(id, uid).run();
        await env.DB.prepare("DELETE FROM entries WHERE customer_id=?").bind(id).run();
        return json({ success: true });
      }

      // ================= LOAD ENTRIES =================
      if (url.pathname === "/load") {
        const month = url.searchParams.get("month");
        const { results } = await env.DB.prepare(
          `SELECT e.* FROM entries e 
           JOIN customers c ON e.customer_id = c.id 
           WHERE e.month=? AND c.user_id=?`
        )
          .bind(month, uid)
          .all();
        return json(results);
      }

      // ================= SAVE ENTRIES =================
      if (url.pathname === "/save" && request.method === "POST") {
        const { month, rows } = await request.json();

        // 1. Delete existing for this month/user
        await env.DB.prepare(
          `DELETE FROM entries 
           WHERE month=? 
           AND customer_id IN (SELECT id FROM customers WHERE user_id=?)`
        )
          .bind(month, uid)
          .run();

        // 2. Insert new rows
        if (rows.length > 0) {
          const stmt = env.DB.prepare(
            `INSERT INTO entries (customer_id, month, rate, days) VALUES (?, ?, ?, ?)`
          );
          const batch = rows.map(r => 
            stmt.bind(r.customer_id, month, r.rate, JSON.stringify(r.days))
          );
          await env.DB.batch(batch);
        }

        return json({ success: true });
      }

      // ================= STATIC ASSETS =================
      // This serves your index.html
      return env.ASSETS.fetch(request);

    } catch (err) {
      return json({ error: err.toString() }, 500);
    }
  },
};
