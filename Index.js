export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    const getUser = async (req) => {
      const cookie = req.headers.get("Cookie") || "";
      const match = cookie.match(/session=([^;]+)/);
      if (!match) return null;

      const s = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token=?"
      ).bind(match[1]).first();

      return s?.user_id || null;
    };

    // --- AUTH ---
    if (url.pathname === "/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const user = await env.DB.prepare(
        "SELECT id FROM users WHERE username=? AND password=?"
      ).bind(username, password).first();

      if (!user) return json({ error: "Invalid login" }, 401);

      const token = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)")
        .bind(token, user.id).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/` }
      });
    }

    // --- CUSTOMERS ---
    const uid = await getUser(request);
    if (!uid && url.pathname !== "/login") return json({ error: "Unauthorized" }, 401);

    if (url.pathname === "/customers") {
      const { results } = await env.DB.prepare("SELECT * FROM customers WHERE user_id=?")
        .bind(uid).all();
      return json(results);
    }

    if (url.pathname === "/customer" && request.method === "POST") {
      const { name } = await request.json();
      const res = await env.DB.prepare("INSERT INTO customers (name, user_id) VALUES (?, ?)")
        .bind(name, uid).run();
      return json({ id: res.meta.last_row_id });
    }

    // --- SAVE & LOAD ---
    if (url.pathname === "/save" && request.method === "POST") {
      const { month, rows } = await request.json();

      // Delete only entries belonging to this user's customers for this month
      await env.DB.prepare(`
        DELETE FROM entries WHERE month=? AND customer_id IN (SELECT id FROM customers WHERE user_id=?)
      `).bind(month, uid).run();

      const stmt = env.DB.prepare(`
        INSERT INTO entries (customer_id, month, qty, rate, old_balance, received, days)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const batch = rows.map(r => 
        stmt.bind(r.customer_id, month, Number(r.qty), Number(r.rate), 0, 0, JSON.stringify(r.days))
      );

      await env.DB.batch(batch);
      return json({ success: true });
    }

    if (url.pathname === "/load") {
      const month = url.searchParams.get("month");
      const { results } = await env.DB.prepare(`
        SELECT e.*, c.name FROM entries e 
        JOIN customers c ON e.customer_id = c.id 
        WHERE e.month=? AND c.user_id=?
      `).bind(month, uid).all();
      return json(results);
    }

    return env.ASSETS.fetch(request);
  }
};
