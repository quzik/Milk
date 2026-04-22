export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const json = (d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json"}});

    const getCookie = (req,name)=>{
      const c=req.headers.get("Cookie")||"";
      const m=c.match(new RegExp(`${name}=([^;]+)`));
      return m?m[1]:null;
    };

    const getUser = async (req)=>{
      const token=getCookie(req,"session");
      if(!token) return null;

      const s=await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token=?"
      ).bind(token).first();

      return s?.user_id;
    };

    const hash = async (p)=>{
      const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(p));
      return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
    };

    try {

      // LOGIN
      if(url.pathname==="/login" && request.method==="POST"){
        const {username,password}=await request.json();
        const user=await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first();
        if(!user) return json({error:"Invalid"},401);

        const h=await hash(password);
        if(h!==user.password_hash) return json({error:"Invalid"},401);

        const token=crypto.randomUUID();
        await env.DB.prepare("INSERT INTO sessions VALUES (?,?,datetime('now'))")
          .bind(token,user.id).run();

        return new Response(JSON.stringify({success:true}),{
          headers:{
            "Content-Type":"application/json",
            "Set-Cookie":`session=${token}; HttpOnly; Path=/`
          }
        });
      }

      // LOGOUT
      if(url.pathname==="/logout"){
        const t=getCookie(request,"session");
        if(t) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(t).run();
        return json({success:true});
      }

      // CUSTOMERS
      if(url.pathname==="/customers"){
        const uid=await getUser(request);
        if(!uid) return json({error:"Unauthorized"},401);

        const {results}=await env.DB.prepare("SELECT * FROM customers WHERE user_id=?").bind(uid).all();
        return json(results);
      }

      if(url.pathname==="/customer" && request.method==="POST"){
        const uid=await getUser(request);
        if(!uid) return json({error:"Unauthorized"},401);

        const {name}=await request.json();
        const r=await env.DB.prepare("INSERT INTO customers (name,user_id) VALUES (?,?)")
          .bind(name,uid).run();

        return json({id:r.meta.last_row_id});
      }

      // SAVE
      if(url.pathname==="/save" && request.method==="POST"){
        const uid=await getUser(request);
        if(!uid) return json({error:"Unauthorized"},401);

        const {month,rows}=await request.json();

        await env.DB.prepare("DELETE FROM entries WHERE month=?").bind(month).run();

        const stmt=env.DB.prepare("INSERT INTO entries (customer_id,month,qty,rate,days) VALUES (?,?,?,?,?)");

        const batch=rows.map(r=>stmt.bind(r.customer_id,month,r.qty,r.rate,JSON.stringify(r.days)));

        await env.DB.batch(batch);

        return json({success:true});
      }

      // ANALYTICS
      if(url.pathname==="/analytics"){
        const uid=await getUser(request);
        if(!uid) return json({error:"Unauthorized"},401);

        const {results}=await env.DB.prepare(`
          SELECT month,
          SUM(qty*rate) revenue
          FROM entries
          GROUP BY month
        `).all();

        return json(results);
      }

      return env.ASSETS.fetch(request);

    } catch(e){
      return json({error:e.message},500);
    }
  }
};
