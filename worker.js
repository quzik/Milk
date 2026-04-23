export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Standardized JSON response helper
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // Extract cookie value precisely
    const getCookie = (req, name) => {
      const match = (req.headers.get("Cookie") || "").match(
        new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
      );
      return match ? match : null;
    };

    // Verify session from DB
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
      // --- AUTHENTICATION ---
      
      // Login Logic
      if (url.pathname === "/login" && request.method === "POST") {
        const { username, password } = await request.json();
        
        // Find user in DB
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username=? AND password=?"
        )
          .bind(username, password.toString())
          .first();
          
        if (!user) return json({ error: "Invalid login" }, 401);

        // Generate Session
        const token = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id) VALUES (?, ?)"
        )
          .bind(token, user.id)
          .run();

        // Set Cookie with Path=/ to ensure it works on all endpoints
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
          },
        });
      }

      // Logout Logic
      if (url.pathname === "/logout") {
        const token = getCookie(request, "session");
        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
          },
        });
      }

      // --- ROUTE GUARD ---
      // Check if user is logged in for all other routes
      const uid = await getUser(request);
      
      // If not logged in and not accessing root, return 401
      if (!uid && url.pathname !== "/") {
        return json({ error: "Unauthorized" }, 401);
      }

      // --- CUSTOMER MANAGEMENT ---
      
      // Get all customers
      if (url.pathname === "/customers" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM customers WHERE user_id=? ORDER BY name ASC"
        )
          .bind(uid)
          .all();
        return json(results);
      }

      // Add customer
      if (url.pathname === "/customer" && request.method === "POST") {
        const { name, rate } = await request.json();
        const res = await env.DB.prepare(
          "INSERT INTO customers (name, default_rate, user_id) VALUES (?, ?, ?)"
        )
          .bind(name, rate || 50, uid)
          .run();
        return json({ id: res.meta.last_row_id });
      }

      // Update customer
      if (url.pathname === "/customer" && request.method === "PUT") {
        const { id, name, rate } = await request.json();
        await env.DB.prepare(
          "UPDATE customers SET name=?, default_rate=? WHERE id=? AND user_id=?"
        )
          .bind(name, rate || 50, id, uid)
          .run();
        return json({ success: true });
      }

      // Delete customer
      if (url.pathname === "/customer" && request.method === "DELETE") {
        const { id } = await request.json();
        // Delete the customer
        await env.DB.prepare("DELETE FROM customers WHERE id=? AND user_id=?").bind(id, uid).run();
        // Cascade delete their entries
        await env.DB.prepare("DELETE FROM entries WHERE customer_id=?").bind(id).run();
        return json({ success: true });
      }

      // --- DATA ENTRY MANAGEMENT ---

      // Load entries for specific month
      if (url.pathname === "/load" && request.method === "GET") {
        const month = url.searchParams.get("month");
        const { results } = await env.DB.prepare(
          `SELECT e.* FROM entries e 
           JOIN customers c ON e.customer_id=c.id 
           WHERE e.month=? AND c.user_id=?`
        )
          .bind(month, uid)
          .all();
        return json(results);
      }

      // Save/Sync records
      if (url.pathname === "/save" && request.method === "POST") {
        const { month, rows } = await request.json();
        
        // 1. Delete current entries for this month for this user's customers
        await env.DB.prepare(
          "DELETE FROM entries WHERE month=? AND customer_id IN (SELECT id FROM customers WHERE user_id=?)"
        )
          .bind(month, uid)
          .run();

        // 2. Insert new data (Batch operation)
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

      // --- STATIC ASSETS ---
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
