import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Send reminder emails to users who started signup but didn't complete onboarding
// This function should be called by a cron job (e.g., daily)

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Find users who:
    // 1. Have verified their email (email_confirmed_at is not null)
    // 2. Don't have a profile (incomplete onboarding)
    // 3. Created their account more than 1 hour ago (give them time to complete)
    // 4. Created their account less than 7 days ago (don't spam old accounts)
    // 5. Haven't received a reminder yet (tracked in user_metadata)

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    })

    if (authError) {
      console.error('Failed to list users:', authError)
      return new Response(
        JSON.stringify({ error: 'Failed to list users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter users who need reminders
    const usersToRemind = authUsers.users.filter(user => {
      // Must have verified email
      if (!user.email_confirmed_at) return false

      // Must be created between 1 hour and 7 days ago
      const createdAt = new Date(user.created_at)
      const oneHourAgoDate = new Date(oneHourAgo)
      const sevenDaysAgoDate = new Date(sevenDaysAgo)

      if (createdAt > oneHourAgoDate || createdAt < sevenDaysAgoDate) return false

      // Must not have received a reminder already
      if (user.user_metadata?.signup_reminder_sent) return false

      return true
    })

    // Get profiles for these users to check who completed onboarding
    const userIds = usersToRemind.map(u => u.id)

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No users need reminders', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('id', userIds)

    const profileIds = new Set(profiles?.map(p => p.id) || [])

    // Users without profiles need reminders
    const incompleteUsers = usersToRemind.filter(u => !profileIds.has(u.id))

    let sentCount = 0
    const errors: string[] = []

    for (const user of incompleteUsers) {
      try {
        // Send reminder email via Resend
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Smuppy <onboarding@resend.dev>',
            to: user.email,
            subject: "You're almost there! Complete your Smuppy account 🎉",
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
                <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <h1 style="color: #00B3C7; margin: 0; font-size: 28px;">Smuppy</h1>
                  </div>

                  <h2 style="color: #0a252f; margin-bottom: 16px;">Hey there! 👋</h2>

                  <p style="color: #333; font-size: 16px; line-height: 1.6;">
                    We noticed you started creating your Smuppy account but didn't finish setting up your profile.
                  </p>

                  <p style="color: #333; font-size: 16px; line-height: 1.6;">
                    Your account is waiting for you! Just a few more steps and you'll be part of our amazing community.
                  </p>

                  <div style="text-align: center; margin: 32px 0;">
                    <a href="smuppy://login" style="display: inline-block; background: linear-gradient(135deg, #00B3C7, #11E3A3); color: white; text-decoration: none; padding: 14px 32px; border-radius: 25px; font-weight: 600; font-size: 16px;">
                      Complete My Profile
                    </a>
                  </div>

                  <p style="color: #666; font-size: 14px; line-height: 1.6;">
                    Open the Smuppy app and log in with <strong>${user.email}</strong> to continue where you left off.
                  </p>

                  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

                  <p style="color: #999; font-size: 12px; text-align: center;">
                    If you didn't create this account, you can safely ignore this email.
                  </p>
                </div>
              </body>
              </html>
            `,
          }),
        })

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text()
          errors.push(`Failed to send to ${user.email}: ${errorText}`)
          continue
        }

        // Mark user as having received a reminder
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...user.user_metadata,
            signup_reminder_sent: true,
            signup_reminder_sent_at: new Date().toISOString(),
          },
        })

        sentCount++
        console.log(`Sent reminder to ${user.email}`)
      } catch (err) {
        errors.push(`Error for ${user.email}: ${err.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${sentCount} reminder emails`,
        count: sentCount,
        totalIncomplete: incompleteUsers.length,
        errors: errors.length > 0 ? errors : undefined,
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
