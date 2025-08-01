import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookData {
  registration_id: string;
  webinar_id: string;
  webinar_title: string;
  participant_name: string;
  participant_email: string;
  time_zone: string;
  webinar_date: string;
  webinar_link: string;
  registration_type: 'free' | 'paid';
  created_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const body = await req.json() as WebhookData;
    console.log('Received webhook data:', body);

    // Validate required fields
    if (!body.participant_email || !body.participant_name || !body.time_zone || !body.webinar_id || !body.registration_id) {
      return new Response(
        JSON.stringify({ error: 'participant_email, participant_name, time_zone, webinar_id, and registration_id are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if registration already exists by registration_id
    const { data: existingRegistration, error: checkError } = await supabase
      .from('webhook_registrations')
      .select('id')
      .eq('registration_id', body.registration_id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing registration:', checkError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let result;
    
    if (existingRegistration) {
      // Update existing registration
      const { data, error } = await supabase
        .from('webhook_registrations')
        .update({
          webinar_id: body.webinar_id,
          webinar_title: body.webinar_title,
          participant_name: body.participant_name,
          participant_email: body.participant_email,
          time_zone: body.time_zone,
          webinar_date: body.webinar_date,
          webinar_link: body.webinar_link,
          registration_type: body.registration_type
        })
        .eq('id', existingRegistration.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating registration:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update registration' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      result = data;
      console.log('Updated registration:', result);
    } else {
      // Insert new registration
      const { data, error } = await supabase
        .from('webhook_registrations')
        .insert({
          registration_id: body.registration_id,
          webinar_id: body.webinar_id,
          webinar_title: body.webinar_title,
          participant_name: body.participant_name,
          participant_email: body.participant_email,
          time_zone: body.time_zone,
          webinar_date: body.webinar_date,
          webinar_link: body.webinar_link,
          registration_type: body.registration_type
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting registration:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to create registration' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      result = data;
      console.log('Created new registration:', result);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        registration: result,
        action: existingRegistration ? 'updated' : 'created'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});