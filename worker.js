export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

      const s = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token=?"
      ).bind(token).first();

      return s?.user_id || null;
    };

    try {

      // ---------- LOGIN ----------
      if (url.pathname === "/login" && request.method === "POST") {
        const { username, password } = await request.json();

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username=? AND password_hash=?"
        ).bind(username, password).first();

        if (!user) return json({ error: "Invalid login" }, 401);

        const token = crypto.randomUUID();

        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id) VALUES (?, ?)"
        ).bind(token, user.id).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Set-Cookie": `session=${token}; Path=/; HttpOnly`
          }
        });
      }

      // ---------- LOGOUT ----------
      if (url.pathname === "/logout") {
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Set-Cookie": `session=; Path=/; Max-Age=0`
          }
        });
      }

      // ---------- CUSTOMERS ----------
      if (url.pathname === "/customers") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const { results } = await env.DB.prepare(
          "SELECT * FROM customers WHERE user_id=?"
        ).bind(uid).all();

        return json(results);
      }

      if (url.pathname === "/customer" && request.method === "POST") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const { name } = await request.json();

        const res = await env.DB.prepare(
          "INSERT INTO customers (name, user_id) VALUES (?, ?)"
        ).bind(name, uid).run();

        return json({ id: res.meta.last_row_id });
      }

      // ---------- SAVE ----------
      if (url.pathname === "/save" && request.method === "POST") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const { month, rows } = await request.json();

        await env.DB.prepare("DELETE FROM entries WHERE month=?")
          .bind(month).run();

        const stmt = env.DB.prepare(`
          INSERT INTO entries (customer_id, month, qty, rate, days)
          VALUES (?, ?, ?, ?, ?)
        `);

        const batch = rows.map(r =>
          stmt.bind(r.customer_id, month, r.qty, r.rate, JSON.stringify(r.days))
        );

        await env.DB.batch(batch);

        return json({ success: true });
      }

      // ---------- ANALYTICS ----------
      if (url.pathname === "/analytics") {
        const uid = await getUser(request);
        if (!uid) return json({ error: "Unauthorized" }, 401);

        const { results } = await env.DB.prepare(`
          SELECT month, SUM(qty * rate) revenue
          FROM entries
          GROUP BY month
        `).all();

        return json(results);
      }

      // ---------- UI ----------
      return env.ASSETS.fetch(request);

    } catch (err) {
      return json({ error: err.toString() }, 500);
    }
  }
};
