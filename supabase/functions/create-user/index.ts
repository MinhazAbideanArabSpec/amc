// ═══════════════════════════════════════════════════════════
//  EDGE FUNCTION: create-user
//
//  Securely creates a new Auth user + their profile row.
//  Runs server-side in Supabase — the service_role key never
//  touches the browser.
//
//  Only callable by an existing admin (checked inside).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  try {
    const body = await req.json()
    const { action } = body

    // ── Verify caller is an authenticated admin ──────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !callerUser) return jsonResponse({ error: 'Invalid session' }, 401)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles').select('role').eq('id', callerUser.id).single()
    if (profileError || !callerProfile || callerProfile.role !== 'admin') {
      return jsonResponse({ error: 'Admins only' }, 403)
    }

    // ── Route by action ───────────────────────────────────
    if (action === 'create-user' || !action) {
      // ── CREATE USER ──────────────────────────────────────
      const { email, name, role, contact_person, phone, customer_id, access_level } = body
      if (!email || !name || !role) return jsonResponse({ error: 'Missing required fields' }, 400)
      if (!['admin', 'customer'].includes(role)) return jsonResponse({ error: 'Invalid role' }, 400)
      if (access_level && !['full', 'hosting'].includes(access_level)) return jsonResponse({ error: 'Invalid access_level' }, 400)

      // Create auth user without password (passwordless / OTP only)
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email, email_confirm: true,
      })
      if (createError) return jsonResponse({ error: 'Failed to create user: ' + createError.message }, 400)

      const { error: insertError } = await adminClient.from('profiles').insert({
        id: newUser.user.id, role, name, email,
        contact_person: contact_person || null,
        phone: phone || null,
        is_active: true,
        customer_id: customer_id || null,
        access_level: access_level || 'full',
      })
      if (insertError) {
        await adminClient.auth.admin.deleteUser(newUser.user.id)
        return jsonResponse({ error: 'Failed to create profile: ' + insertError.message }, 400)
      }
      return jsonResponse({ success: true, user_id: newUser.user.id }, 200)
    }

    if (action === 'reset-password') {
      // ── RESET PASSWORD ───────────────────────────────────
      const { user_id, new_password } = body
      if (!user_id || !new_password) return jsonResponse({ error: 'Missing user_id or new_password' }, 400)
      if (new_password.length < 6) return jsonResponse({ error: 'Password must be at least 6 characters' }, 400)

      const { error: resetError } = await adminClient.auth.admin.updateUserById(user_id, {
        password: new_password
      })
      if (resetError) return jsonResponse({ error: 'Failed to reset password: ' + resetError.message }, 400)
      return jsonResponse({ success: true }, 200)
    }

    return jsonResponse({ error: 'Unknown action' }, 400)

  } catch (err) {
    return jsonResponse({ error: 'Unexpected error: ' + err.message }, 500)
  }
})

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}