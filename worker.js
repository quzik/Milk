export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    const getCookie = (req, name) => {
      const match = (req.headers.get("Cookie") || "").match(new RegExp(`${name}=([^;]+)`));
      return match ? match[1] : null;
    };

    const getUser = async (req) => {
      const token = getCookie(req, "session");
      if (!token) return null;
      const s = await env.DB.prepare("SELECT user_id FROM sessions WHERE token=?").bind(token).first();
      return s?.user_id || null;
    };

    try {
      // --- AUTH ---
      if (url.pathname === "/login" && request.method === "POST") {
        const { username, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE username=? AND password=?").bind(username, password).first();
        if (!user) return json({ error: "Invalid login" }, 401);
        const token = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").bind(token, user.id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Set-Cookie": `session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict` } });
      }
      if (url.pathname === "/logout") {
        return new Response(JSON.stringify({ success: true }), { headers: { "Set-Cookie": `session=; Path=/; Max-Age=0; HttpOnly` } });
      }

      const uid = await getUser(request);
      if (!uid && url.pathname !== "/") {
        if (url.pathname.startsWith("/customer") || ["/save", "/load", "/analytics"].includes(url.pathname)) return json({ error: "Unauthorized" }, 401);
      }

      // --- CUSTOMERS ---
      if (url.pathname === "/customers") {
        const { results } = await env.DB.prepare("SELECT * FROM customers WHERE user_id=?").bind(uid).all();
        return json(results);
      }
      if (url.pathname === "/customer" && request.method === "POST") {
        const { name, rate } = await request.json();
        const res = await env.DB.prepare("INSERT INTO customers (name, default_rate, user_id) VALUES (?, ?, ?)").bind(name, rate || 50, uid).run();
        return json({ id: res.meta.last_row_id });
      }
      // NEW: Edit Customer
      if (url.pathname === "/customer" && request.method === "PUT") {
        const { id, name, rate } = await request.json();
        await env.DB.prepare("UPDATE customers SET name=?, default_rate=? WHERE id=? AND user_id=?").bind(name, rate, id, uid).run();
        return json({ success: true });
      }
      if (url.pathname === "/customer" && request.method === "DELETE") {
        const { id } = await request.json();
        await env.DB.prepare("DELETE FROM customers WHERE id=? AND user_id=?").bind(id, uid).run();
        await env.DB.prepare("DELETE FROM entries WHERE customer_id=?").bind(id).run(); 
        return json({ success: true });
      }

      // --- ENTRIES ---
      if (url.pathname === "/load") {
        const month = url.searchParams.get("month");
        const { results } = await env.DB.prepare(`SELECT e.* FROM entries e JOIN customers c ON e.customer_id = c.id WHERE e.month=? AND c.user_id=?`).bind(month, uid).all();
        return json(results);
      }

      if (url.pathname === "/save" && request.method === "POST") {
        const { month, rows } = await request.json();
        await env.DB.prepare("DELETE FROM entries WHERE month=? AND customer_id IN (SELECT id FROM customers WHERE user_id=?)").bind(month, uid).run();
        const stmt = env.DB.prepare("INSERT INTO entries (customer_id, month, qty, rate, days, old_balance, received) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const batch = rows.map(r => stmt.bind(r.customer_id, month, r.qty, r.rate, JSON.stringify(r.days), r.old_balance, r.received));
        await env.DB.batch(batch);
        return json({ success: true });
      }

      return env.ASSETS.fetch(request);
    } catch (err) { return json({ error: err.toString() }, 500); }
  }
};
