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
      // More robust cookie parsing
      const match = cookie.match(/(?:^|;)\s*session=([^;]+)/);
      if (!match) return null;

      const token = decodeURIComponent(match[1].trim());
      const s = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token = ?"
      ).bind(token).first();

      return s?.user_id || null;
    };

    // --- AUTH ---
    if (url.pathname === "/login" && request.method === "POST") {
      try {
        const { username, password } = await request.json();
        
        // Basic validation
        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
          return json({ error: "Username and password required" }, 400);
        }

        // NOTE: In production, hash passwords with bcrypt/argon2. 
        // For now, this is plaintext (insecure but matches your schema).
        const user = await env.DB.prepare(
          "SELECT id FROM users WHERE username = ? AND password = ?"
        ).bind(username.trim(), password).first();

        if (!user) return json({ error: "Invalid login" }, 401);

        const token = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, datetime('now'))"
        ).bind(token, user.id).run();

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`
          }
        });
      } catch (err) {
        return json({ error: "Login failed: " + err.message }, 500);
      }
    }

    // --- AUTH CHECK ---
    const uid = await getUser(request);
    if (!uid && url.pathname !== "/login") {
      return json({ error: "Unauthorized" }, 401);
    }

    // --- CUSTOMERS ---
    if (url.pathname === "/customers" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, name FROM customers WHERE user_id = ? ORDER BY name"
      ).bind(uid).all();
      return json(results);
    }

    if (url.pathname === "/customer" && request.method === "POST") {
      try {
        const { name } = await request.json();
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return json({ error: "Name required" }, 400);
        }
        
        const cleanName = name.trim().slice(0, 100); // Limit length
        
        const res = await env.DB.prepare(
          "INSERT INTO customers (name, user_id) VALUES (?, ?)"
        ).bind(cleanName, uid).run();
        
        return json({ id: res.meta.last_row_id });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // --- SAVE ---
    if (url.pathname === "/save" && request.method === "POST") {
      try {
        const { month, rows } = await request.json();
        
        if (!month || !Array.isArray(rows)) {
          return json({ error: "Invalid data" }, 400);
        }

        // Validate row data
        for (const r of rows) {
          if (!r.customer_id || typeof r.qty !== 'number' || typeof r.rate !== 'number') {
            return json({ error: "Invalid row data" }, 400);
          }
        }

        // Use transaction: batch with BEGIN/COMMMIT for atomicity
        const statements = [];
        
        // Start transaction
        statements.push(env.DB.prepare("BEGIN TRANSACTION"));
        
        // Delete existing
        statements.push(
          env.DB.prepare(`
            DELETE FROM entries 
            WHERE month = ? AND customer_id IN (
              SELECT id FROM customers WHERE user_id = ?
            )
          `).bind(month, uid)
        );

        // Insert new
        for (const r of rows) {
          statements.push(
            env.DB.prepare(`
              INSERT INTO entries (customer_id, month, qty, rate, old_balance, received, days)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
              r.customer_id, 
              month, 
              Number(r.qty), 
              Number(r.rate), 
              Number(r.old_balance || 0), 
              Number(r.received || 0),
              JSON.stringify(Array.isArray(r.days) ? r.days : [r.delivered || false])
            )
          );
        }
        
        statements.push(env.DB.prepare("COMMIT"));
        
        await env.DB.batch(statements);
        return json({ success: true });
      } catch (err) {
        // Attempt rollback on error (best effort)
        try { await env.DB.prepare("ROLLBACK").run(); } catch {}
        return json({ error: "Save failed: " + err.message }, 500);
      }
    }

    // --- LOAD ---
    if (url.pathname === "/load" && request.method === "GET") {
      const month = url.searchParams.get("month");
      if (!month) return json({ error: "Month required" }, 400);

      const { results } = await env.DB.prepare(`
        SELECT e.id, e.customer_id, e.month, e.qty, e.rate, 
               e.old_balance, e.received, e.days, c.name 
        FROM entries e 
        JOIN customers c ON e.customer_id = c.id 
        WHERE e.month = ? AND c.user_id = ?
      `).bind(month, uid).all();

      // Parse JSON days string back to array for frontend
      const parsed = results.map(row => ({
        ...row,
        days: typeof row.days === 'string' ? JSON.parse(row.days) : row.days,
        qty: Number(row.qty),
        rate: Number(row.rate)
      }));

      return json(parsed);
    }

    // --- DELETE ENTRY (bonus utility) ---
    if (url.pathname === "/entry" && request.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "ID required" }, 400);
      
      // Verify ownership before delete
      const entry = await env.DB.prepare(`
        SELECT e.id FROM entries e 
        JOIN customers c ON e.customer_id = c.id 
        WHERE e.id = ? AND c.user_id = ?
      `).bind(id, uid).first();
      
      if (!entry) return json({ error: "Not found" }, 404);
      
      await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(id).run();
      return json({ success: true });
    }

    return env.ASSETS.fetch(request);
  }
};
