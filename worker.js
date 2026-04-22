export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Helper to return JSON
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // Helper to get cookie
    const getCookie = (req, name) => {
      const match = (req.headers.get("Cookie") || "").match(
        new RegExp(`${name}=([^;]+)`)
      );
      return match ? match[1] : null;
    };

    // Get user from session cookie
    const getUser = async (req) => {
      const token = getCookie(req, "session");
      if (!token) return null;
      const s = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token=?"
      )
        .bind(token)
        .first();
      return s?.user_id || null;
    };

    try {
      // --- LOGIN ---
      if (url.pathname === "/login" && request.method === "POST") {
        const { username, password } = await request.json();
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username=? AND password=?"
        )
          .bind(username, password)
          .first();
        if (!user) return json({ error: "Invalid login" }, 401);

        const token = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id) VALUES (?, ?)"
        )
          .bind(token, user.id)
          .run();

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Set-Cookie": `session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
          },
        });
      }

      // --- LOGOUT ---
      if (url.pathname === "/logout") {
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Set-Cookie":
              "session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
          },
        });
      }

      // --- AUTH CHECK ---
      const uid = await getUser(request);
      if (!uid) {
        if (
          url.pathname !== "/" &&
          url.pathname !== "/login" &&
          url.pathname !== "/logout"
        )
          return json({ error: "Unauthorized" }, 401);
      }

      // --- GET ALL CUSTOMERS ---
      if (url.pathname === "/customers") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM customers WHERE user_id=?"
        )
          .bind(uid)
          .all();
        return json(results);
      }

      // --- ADD CUSTOMER ---
      if (url.pathname === "/customer" && request.method === "POST") {
        const { name, rate } = await request.json();
        const res = await env.DB.prepare(
          "INSERT INTO customers (name, default_rate, user_id) VALUES (?, ?, ?)"
        )
          .bind(name, rate || 50, uid)
          .run();
        return json({ id: res.meta.last_row_id });
      }

      // --- DELETE CUSTOMER ---
      if (url.pathname === "/customer" && request.method === "DELETE") {
        const { id } = await request.json();
        await env.DB.prepare(
          "DELETE FROM customers WHERE id=? AND user_id=?"
        )
          .bind(id, uid)
          .run();
        await env.DB.prepare(
          "DELETE FROM entries WHERE customer_id=?"
        )
          .bind(id)
          .run();
        return json({ success: true });
      }

      // --- UPDATE CUSTOMER ---
      if (url.pathname === "/customer" && request.method === "PUT") {
        const { id, name, rate } = await request.json();
        await env.DB.prepare(
          "UPDATE customers SET name=?, default_rate=? WHERE id=? AND user_id=?"
        )
          .bind(name, rate || 50, id, uid)
          .run();
        return json({ success: true });
      }

      // --- SAVE ENTRIES ---
      if (url.pathname === "/save" && request.method === "POST") {
        const { month, entries } = await request.json();
        for (const e of entries) {
          await env.DB.prepare(
            `INSERT INTO entries (customer_id, month, day, litre, rate) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(customer_id, month, day) 
             DO UPDATE SET litre=?, rate=?`
          )
            .bind(e.customer_id, month, e.day, e.litre, e.rate, e.litre, e.rate)
            .run();
        }
        return json({ success: true });
      }

      // --- LOAD ENTRIES ---
      if (url.pathname === "/load") {
        const month = parseInt(url.searchParams.get("month"));
        const { results } = await env.DB.prepare(
          "SELECT * FROM entries WHERE user_id=? AND month=?"
        )
          .bind(uid, month)
          .all();
        return json(results);
      }

      return json({ message: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
