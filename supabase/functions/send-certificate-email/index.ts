import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
            <h1>🎓 Congratulations, ${participant_name}!</h1>
            <p>Your certificate is ready</p>
          </div>
          
          <div class="content">
            <p>Dear ${participant_name},</p>
            
            <p>${message}</p>
            
            <div class="certificate-preview">
              <h3>Your Certificate</h3>
              <p><strong>Certificate Number:</strong> ${certificate_number}</p>
              <img src="${certificate_url}" alt="Certificate for ${participant_name}" />
            </div>
            
            <p style="text-align: center;">
              <a href="${certificate_url}" class="button" download="Certificate_${participant_name.replace(/\s+/g, '_')}.png">
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

    // Send email using SMTP
    const smtpConfig = {
      hostname: "smtp.titan.email",
      port: 465,
      username: "support@academicdigital.space",
      password: Deno.env.get('SMTP_PASSWORD') || '',
    };

    try {
      // Port 465 uses direct TLS connection (SMTPS)
      const conn = await Deno.connectTls({
        hostname: smtpConfig.hostname,
        port: smtpConfig.port,
      });

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // Helper function to send command and read response
      const sendCommand = async (command: string) => {
        await conn.write(encoder.encode(command + '\r\n'));
        
        let response = '';
        const buffer = new Uint8Array(1024);
        
        while (true) {
          const n = await conn.read(buffer);
          if (n === null || n === 0) break;
          
          const chunk = decoder.decode(buffer.subarray(0, n));
          response += chunk;
          
          // Check if we have a complete SMTP response
          // SMTP responses end with \r\n and the last line should not have a trailing hyphen
          const lines = response.split('\r\n');
          if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            // If the last line is empty (after \r\n split), check the second-to-last line
            const statusLine = lastLine === '' ? lines[lines.length - 2] : lastLine;
            
            // Check if this is a complete response (no trailing hyphen and ends with \r\n)
            if (statusLine && !statusLine.endsWith('-') && response.endsWith('\r\n')) {
              break;
            }
          }
        }
        
        console.log(`SMTP Command: ${command}`);
        console.log(`SMTP Response: ${response}`);
        return response;
      };

      // SMTP conversation for port 465 (direct TLS)
      await sendCommand(`EHLO ${smtpConfig.hostname}`);
      await sendCommand('AUTH LOGIN');
      await sendCommand(btoa(smtpConfig.username));
      await sendCommand(btoa(smtpConfig.password));
      await sendCommand(`MAIL FROM:<${smtpConfig.username}>`);
      await sendCommand(`RCPT TO:<${to}>`);
      await sendCommand('DATA');
      
      const emailData = `From: "Metascholar Institute" <${smtpConfig.username}>
To: ${to}
Subject: ${subject}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8

${htmlContent}
.`;

      await sendCommand(emailData);
      await sendCommand('QUIT');
      
      conn.close();
      
      console.log('Certificate email sent successfully via SMTP');
    } catch (smtpError: any) {
      console.error('SMTP sending failed:', smtpError);
      throw new Error(`Failed to send email: ${smtpError.message}`);
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