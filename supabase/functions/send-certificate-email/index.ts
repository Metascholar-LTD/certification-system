import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "./smtp-client.ts";
import { generateCertificateEmailTemplate } from "./email-template.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  to: string;
  subject: string;
  message: string;
  participant_name: string;
  certificate_number: string;
  certificate_url: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const { to, subject, message, participant_name, certificate_number, certificate_url }: EmailRequest = await req.json();
    console.log('Sending certificate email:', { to, subject, message, participant_name, certificate_number, certificate_url });

    // Validate required fields
    if (!to || !participant_name || !certificate_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, participant_name, certificate_url' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate email content using template
    const htmlContent = generateCertificateEmailTemplate({
      participant_name,
      message,
      certificate_number,
      certificate_url
    });

    // Send email using SMTP client
    const smtpConfig = {
      hostname: "smtp.titan.email",
      port: 465,
      username: "support@academicdigital.space",
      password: Deno.env.get('SMTP_PASSWORD') || '',
    };

    // Validate SMTP configuration
    if (!smtpConfig.password) {
      throw new Error('SMTP_PASSWORD environment variable is not configured');
    }
    
    if (!smtpConfig.username || !smtpConfig.username.includes('@')) {
      throw new Error('Invalid SMTP username. Must be a valid email address.');
    }
    
    console.log('SMTP Config:', { 
      hostname: smtpConfig.hostname, 
      port: smtpConfig.port, 
      username: smtpConfig.username,
      passwordSet: !!smtpConfig.password 
    });

    const smtpClient = new SmtpClient(smtpConfig);
    
    try {
      await smtpClient.connect();
      
      await smtpClient.sendEmail({
        from: smtpConfig.username, // Use just the email address for now
        to: to,
        subject: subject || `Your Certificate - ${participant_name}`,
        html: htmlContent
      });
      
      console.log('Certificate email sent successfully via SMTP');
    } catch (smtpError: any) {
      console.error('SMTP sending failed:', smtpError);
      throw new Error(`Failed to send email: ${smtpError.message}`);
    } finally {
      await smtpClient.disconnect();
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Certificate email sent successfully',
        details: {
          to: to,
          subject: subject,
          from: 'support@academicdigital.space',
          certificate_number: certificate_number
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );

  } catch (error: any) {
    console.error('Error sending certificate email:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send certificate email', 
        details: error.message 
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);