export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { "Content-Type": "application/json" }
    });

    const getCookie = (req, name) => {
      const match = (req.headers.get("Cookie") || "").match(new RegExp(`${name}=([^;]+)`));
      return match ? match : null;
    };

    // Check if user is logged in
    const uid = await (async () => {
      const token = getCookie(request, "session");
      if (!token) return null;
      const s = await env.DB.prepare("SELECT user_id FROM sessions WHERE token=?").bind(token).first();
      return s?.user_id || null;
    })();

    try {
      // LOGIN
      if (url.pathname === "/login" && request.method === "POST") {
        const { username, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE username=? AND password=?").bind(username, password).first();
        
        if (!user) return json({ error: "Wrong credentials" }, 401);

        const token = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").bind(token, user.id).run();

        // Standard cookie - works on http and https
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; Path=/; HttpOnly; Max-Age=604800`
          },
        });
      }

      // AUTH GATE - If not logged in, block API calls
      const apiPaths = ["/customers", "/customer", "/save", "/load"];
      if (!uid && apiPaths.some(p => url.pathname.startsWith(p))) {
        return json({ error: "Unauthorized" }, 401);
      }

      // API ROUTES
      if (url.pathname === "/customers") {
        const { results } = await env.DB.prepare("SELECT * FROM customers WHERE user_id=?").bind(uid).all();
        return json(results);
      }

      if (url.pathname === "/customer" && request.method === "POST") {
        const { name, rate } = await request.json();
        const res = await env.DB.prepare("INSERT INTO customers (name, default_rate, user_id) VALUES (?, ?, ?)").bind(name, rate, uid).run();
        return json({ success: true, id: res.meta.last_row_id });
      }

      if (url.pathname === "/load") {
        const month = url.searchParams.get("month");
        const { results } = await env.DB.prepare("SELECT e.* FROM entries e JOIN customers c ON e.customer_id = c.id WHERE e.month=? AND c.user_id=?").bind(month, uid).all();
        return json(results);
      }

      if (url.pathname === "/save" && request.method === "POST") {
        const { month, rows } = await request.json();
        await env.DB.prepare("DELETE FROM entries WHERE month=? AND customer_id IN (SELECT id FROM customers WHERE user_id=?)").bind(month, uid).run();
        const stmt = env.DB.prepare("INSERT INTO entries (customer_id, month, rate, days) VALUES (?, ?, ?, ?)");
        await env.DB.batch(rows.map(r => stmt.bind(r.customer_id, month, r.rate, JSON.stringify(r.days))));
        return json({ success: true });
      }

      // STATIC FILES (index.html)
      return env.ASSETS.fetch(request);

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
};
