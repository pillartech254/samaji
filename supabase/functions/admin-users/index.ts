import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is super_admin using their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "No auth token" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonResp({ error: "Invalid token" }, 401);

    const { data: profile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    if (!profile || profile.role !== "super_admin") {
      return jsonResp({ error: "Not authorized" }, 403);
    }

    // Service role client for admin operations
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const action = body.action;

    if (action === "create_user") {
      const { email, password, role, school_id, phone, full_name } = body;
      if (!email || !password) return jsonResp({ error: "Email and password required" }, 400);

      // Create user via GoTrue Admin API (proper password hashing)
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name || "",
          phone: phone || "",
        },
      });
      if (createErr) return jsonResp({ error: createErr.message }, 400);

      const uid = newUser.user.id;

      // Set profile
      await admin.from("profiles").upsert({
        id: uid,
        role: role || "parent",
        school_id: school_id || null,
      });

      // Create parent_accounts record if parent
      if (role === "parent" && phone) {
        await admin.from("parent_accounts").upsert({
          id: uid,
          school_id,
          phone,
          full_name: full_name || null,
          must_change_password: true,
        });
      }

      return jsonResp({ user_id: uid });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) return jsonResp({ error: "user_id and new_password required" }, 400);

      const { error } = await admin.auth.admin.updateUserById(user_id, {
        password: new_password,
      });
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ success: true });
    }

    if (action === "delete_user") {
      const { user_id } = body;
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);

      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ success: true });
    }

    return jsonResp({ error: "Unknown action" }, 400);
  } catch (e) {
    return jsonResp({ error: e.message || "Internal error" }, 500);
  }
});

function jsonResp(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
