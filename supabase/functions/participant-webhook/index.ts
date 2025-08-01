import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebinarRegistrationData {
  email: string;
  first_name: string;
  surname: string;
  phone?: string;
  company?: string;
  job_title?: string;
  time_zone: string;
  webinar_id: string;
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

    const body = await req.json() as WebinarRegistrationData;
    console.log('Received webinar registration data:', body);

    // Validate required fields
    if (!body.email || !body.first_name || !body.surname || !body.time_zone || !body.webinar_id) {
      return new Response(
        JSON.stringify({ error: 'Email, first_name, surname, time_zone, and webinar_id are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate UUID format for webinar_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(body.webinar_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid webinar_id format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if registration already exists
    const { data: existingRegistration, error: checkError } = await supabase
      .from('webinar_registrations')
      .select('id, registration_status')
      .eq('email', body.email)
      .eq('webinar_id', body.webinar_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing participant:', checkError);
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
        .from('webinar_registrations')
        .update({
          first_name: body.first_name,
          surname: body.surname,
          phone: body.phone,
          company: body.company,
          job_title: body.job_title,
          time_zone: body.time_zone
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
        .from('webinar_registrations')
        .insert({
          email: body.email,
          first_name: body.first_name,
          surname: body.surname,
          phone: body.phone,
          company: body.company,
          job_title: body.job_title,
          time_zone: body.time_zone,
          webinar_id: body.webinar_id,
          registration_status: 'registered'
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