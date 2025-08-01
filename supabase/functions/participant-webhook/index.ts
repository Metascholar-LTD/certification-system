import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ParticipantData {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  company?: string;
  job_title?: string;
  webinar_id?: string;
  course: string;
  completion_date?: string;
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

    const body = await req.json() as ParticipantData;
    console.log('Received participant data:', body);

    // Validate required fields
    if (!body.email || !body.course) {
      return new Response(
        JSON.stringify({ error: 'Email and course are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if participant already exists
    const { data: existingParticipant, error: checkError } = await supabase
      .from('participants')
      .select('id, status')
      .eq('email', body.email)
      .eq('course', body.course)
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
    
    if (existingParticipant) {
      // Update existing participant
      const { data, error } = await supabase
        .from('participants')
        .update({
          first_name: body.first_name,
          last_name: body.last_name,
          phone: body.phone,
          company: body.company,
          job_title: body.job_title,
          webinar_id: body.webinar_id,
          completion_date: body.completion_date ? new Date(body.completion_date).toISOString() : null,
          status: body.completion_date ? 'completed' : 'registered'
        })
        .eq('id', existingParticipant.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating participant:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update participant' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      result = data;
      console.log('Updated participant:', result);
    } else {
      // Insert new participant
      const { data, error } = await supabase
        .from('participants')
        .insert({
          email: body.email,
          first_name: body.first_name,
          last_name: body.last_name,
          phone: body.phone,
          company: body.company,
          job_title: body.job_title,
          webinar_id: body.webinar_id,
          course: body.course,
          completion_date: body.completion_date ? new Date(body.completion_date).toISOString() : null,
          status: body.completion_date ? 'completed' : 'registered'
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting participant:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to create participant' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      result = data;
      console.log('Created new participant:', result);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        participant: result,
        action: existingParticipant ? 'updated' : 'created'
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