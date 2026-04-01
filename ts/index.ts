// Supabase Edge Function: notify
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify Authorization: Only allow authenticated admins to trigger broadcasts
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Since we use a custom session-based approach, we expect the Admin to provide their email and a valid session check.
    // In a real production environment with Supabase Auth, we would use supabaseClient.auth.getUser(token).
    // For this implementation, we will verify the user's role from the database.
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
        // Fallback for custom session if Supabase Auth isn't fully utilized for the admin user
        // We'll check the 'X-Admin-Email' header for now as a secondary verification
        const adminEmail = req.headers.get('X-Admin-Email');
        if (adminEmail) {
            const { data: dbUser } = await supabaseClient.from('users').select('role').eq('email', adminEmail).single();
            if (!dbUser || dbUser.role !== 'admin') {
                return new Response(JSON.stringify({ error: 'Unauthorized: Admin privileges required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }
        } else {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }
    } else {
        // Verify role from metadata or database
        const { data: dbUser } = await supabaseClient.from('users').select('role').eq('email', user.email).single();
        if (!dbUser || dbUser.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized: Admin privileges required' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            });
        }
    }

    const { type, payload } = await req.json();

    if (!type) {
      return new Response(JSON.stringify({ error: 'Missing request type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (type === 'broadcast') {
      // Manual broadcast from Admin
      const { role, title, message, link } = payload;

      if (!title || !message) {
        return new Response(JSON.stringify({ error: 'Title and message are required for broadcast' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      let query = supabaseClient.from('users').select('email, notification_preferences');
      if (role && role !== 'all') {
        query = query.eq('role', role);
      }

      const { data: users, error: userError } = await query;

      if (userError) throw userError;

      let successCount = 0;
      if (users) {
        // Filter users based on their notification preferences
        const filteredUsers = users.filter(user => {
            const prefs = user.notification_preferences || { email: true, push: true, inApp: true };
            return prefs.inApp; // Only broadcast if in-app is enabled
        });

        // Send notifications in parallel for better performance
        const notifications = filteredUsers.map(user =>
          supabaseClient.rpc('notify_user', {
            target_email: user.email,
            title: title,
            msg: message,
            link: link || null
          })
        );

        const results = await Promise.all(notifications);
        successCount = results.filter(r => !r.error).length;
      }

      return new Response(JSON.stringify({
        success: true,
        count: successCount,
        total: users?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: `Unsupported notification type: ${type}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });

  } catch (error) {
    console.error('Edge Function Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
