import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  to: string;
  subject: string;
  message: string;
  participant_name: string;
  certificate_number: string;
  certificate_url: string;
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

    const emailData = await req.json() as EmailRequest;
    console.log('Sending certificate email:', emailData);

    // Validate required fields
    if (!emailData.to || !emailData.participant_name || !emailData.certificate_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, participant_name, certificate_url' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create HTML email content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Certificate from Metascholar Institute</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .certificate-preview { text-align: center; margin: 20px 0; }
            .certificate-preview img { max-width: 100%; height: auto; border: 2px solid #e2e8f0; border-radius: 8px; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🎓 Congratulations, ${emailData.participant_name}!</h1>
            <p>Your certificate is ready</p>
          </div>
          
          <div class="content">
            <p>Dear ${emailData.participant_name},</p>
            
            <p>${emailData.message}</p>
            
            <div class="certificate-preview">
              <h3>Your Certificate</h3>
              <p><strong>Certificate Number:</strong> ${emailData.certificate_number}</p>
              <img src="${emailData.certificate_url}" alt="Certificate for ${emailData.participant_name}" />
            </div>
            
            <p style="text-align: center;">
              <a href="${emailData.certificate_url}" class="button" download="Certificate_${emailData.participant_name.replace(/\s+/g, '_')}.png">
                📥 Download Certificate
              </a>
            </p>
            
            <p>This certificate serves as proof of your successful completion of the course. You can download and print it for your records.</p>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br>
            <strong>Metascholar Institute Team</strong></p>
          </div>
          
          <div class="footer">
            <p>This email was sent automatically. Please do not reply to this email.</p>
            <p>© 2024 Metascholar Institute. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    console.log('Sending email via Supabase to:', emailData.to);

    try {
      // Send email using Supabase's built-in email service
      const { data, error } = await supabase.auth.admin.sendRawEmail({
        to: emailData.to,
        subject: emailData.subject,
        html: htmlContent,
      });

      if (error) {
        console.error('Supabase email sending error:', error);
        throw new Error(`Failed to send email via Supabase: ${error.message}`);
      }

      console.log('Email sent successfully via Supabase');
      
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Certificate email sent successfully',
        recipient: emailData.to,
        certificate_number: emailData.certificate_number
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Email sending error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error'  
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});