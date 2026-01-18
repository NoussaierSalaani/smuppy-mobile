import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Hash a string using SHA256
async function hashString(str: string): Promise<string> {
  const normalized = str.toLowerCase().trim()
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Normalize phone number (remove spaces, dashes, etc.)
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+')
}

interface Contact {
  name?: string
  emails?: string[]
  phones?: string[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the JWT from the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Get the user from the JWT
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { contacts } = await req.json() as { contacts: Contact[] }

    if (!contacts || !Array.isArray(contacts)) {
      return new Response(
        JSON.stringify({ error: 'Invalid contacts array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // First, store the user's own contact hash (for others to match)
    if (user.email) {
      const userEmailHash = await hashString(user.email)
      await supabaseAdmin
        .from('user_contact_hashes')
        .upsert({
          user_id: user.id,
          email_hash: userEmailHash,
        }, { onConflict: 'user_id' })
    }

    // Process and store contacts
    const contactsToInsert: any[] = []
    const seenHashes = new Set<string>()

    for (const contact of contacts) {
      const displayName = contact.name?.split(' ')[0] || 'Friend' // First name only

      // Process emails
      if (contact.emails && contact.emails.length > 0) {
        for (const email of contact.emails) {
          if (!email || !email.includes('@')) continue

          const emailHash = await hashString(email)
          const key = `email:${emailHash}`

          if (seenHashes.has(key)) continue
          seenHashes.add(key)

          contactsToInsert.push({
            user_id: user.id,
            email_hash: emailHash,
            contact_type: 'email',
            display_name: displayName,
          })
        }
      }

      // Process phones
      if (contact.phones && contact.phones.length > 0) {
        for (const phone of contact.phones) {
          if (!phone || phone.length < 6) continue

          const normalizedPhone = normalizePhone(phone)
          const phoneHash = await hashString(normalizedPhone)
          const key = `phone:${phoneHash}`

          if (seenHashes.has(key)) continue
          seenHashes.add(key)

          contactsToInsert.push({
            user_id: user.id,
            phone_hash: phoneHash,
            contact_type: 'phone',
            display_name: displayName,
          })
        }
      }
    }

    // Batch insert contacts (ignore duplicates)
    let insertedCount = 0
    if (contactsToInsert.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < contactsToInsert.length; i += 100) {
        const batch = contactsToInsert.slice(i, i + 100)
        const { error: insertError, count } = await supabaseAdmin
          .from('user_contacts')
          .upsert(batch, {
            onConflict: 'user_id,email_hash',
            ignoreDuplicates: true
          })

        if (!insertError) {
          insertedCount += batch.length
        }
      }
    }

    // Match contacts with existing users
    const { data: matchResult } = await supabaseAdmin
      .rpc('match_user_contacts', { p_user_id: user.id })

    // Get count of friends already on the app
    const { count: friendsOnApp } = await supabaseAdmin
      .from('user_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_app_user', true)

    return new Response(
      JSON.stringify({
        success: true,
        contactsStored: insertedCount,
        friendsOnApp: friendsOnApp || 0,
        message: friendsOnApp && friendsOnApp > 0
          ? `${friendsOnApp} of your friends are already on Smuppy!`
          : 'Contacts saved! We\'ll notify you when friends join.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
