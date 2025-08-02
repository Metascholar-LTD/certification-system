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

// SMTP Client for smtp.titan.email
class TitanSMTPClient {
  private config: {
    hostname: string;
    port: number;
    username: string;
    password: string;
  };
  private conn: Deno.TlsConn | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(config: { hostname: string; port: number; username: string; password: string }) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.conn = await Deno.connectTls({
        hostname: this.config.hostname,
        port: this.config.port,
      });

      const greeting = await this.readResponse();
      console.log('SMTP Connected:', greeting.substring(0, 50));
      
      if (!greeting.startsWith('220')) {
        throw new Error(`Connection failed: ${greeting}`);
      }
    } catch (error) {
      console.error('SMTP connection error:', error);
      throw error;
    }
  }

  async sendEmail(emailData: { from: string; to: string; subject: string; html: string }): Promise<void> {
    if (!this.conn) throw new Error('Not connected to SMTP server');

    try {
      console.log('Starting SMTP transaction...');
      
      // EHLO
      await this.sendCommandAndValidate('EHLO ' + this.config.hostname, '250');
      
      // AUTH LOGIN
      await this.sendCommandAndValidate('AUTH LOGIN', '334');
      
      // Username (base64)
      await this.sendCommandAndValidate(btoa(this.config.username), '334');
      
      // Password (base64)
      await this.sendCommandAndValidate(btoa(this.config.password), '235');
      
      // MAIL FROM
      await this.sendCommandAndValidate(`MAIL FROM:<${emailData.from}>`, '250');
      
      // RCPT TO
      await this.sendCommandAndValidate(`RCPT TO:<${emailData.to}>`, '250');
      
      // DATA
      await this.sendCommandAndValidate('DATA', '354');
      
      // Send email content
      const emailContent = [
        `From: ${emailData.from}`,
        `To: ${emailData.to}`,
        `Subject: ${emailData.subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        emailData.html
      ].join('\r\n');
      
      // Send content followed by termination sequence
      await this.conn.write(this.encoder.encode(emailContent + '\r\n.\r\n'));
      
      // Read final response
      const finalResponse = await this.readResponse();
      console.log('Email sent, final response:', finalResponse);
      
      if (!finalResponse.startsWith('250')) {
        throw new Error(`Email sending failed: ${finalResponse}`);
      }
      
      console.log('Email sent successfully!');
      
    } catch (error) {
      console.error('SMTP send error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      try {
        await this.sendCommandAndValidate('QUIT', '221');
      } catch (e) {
        console.warn('Error during QUIT:', e);
      } finally {
        this.conn.close();
        this.conn = null;
      }
    }
  }

  private async sendCommandAndValidate(command: string, expectedCode: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    
    const logCommand = command.includes(btoa(this.config.password)) ? '[PASSWORD]' : 
                      command.includes(btoa(this.config.username)) ? '[USERNAME]' : command;
    console.log('SMTP >', logCommand);
    
    await this.conn.write(this.encoder.encode(command + '\r\n'));
    const response = await this.readResponse();
    
    console.log('SMTP <', response.substring(0, 100));
    
    if (!response.startsWith(expectedCode)) {
      throw new Error(`Command failed: ${command.split(' ')[0]} - Expected ${expectedCode}, got: ${response}`);
    }
  }

  private async readResponse(): Promise<string> {
    if (!this.conn) throw new Error('Not connected');
    
    const buffer = new Uint8Array(4096);
    let response = '';
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const n = await this.conn.read(buffer);
      if (n === null) break;
      
      response += this.decoder.decode(buffer.subarray(0, n));
      
      // Check if we have a complete SMTP response
      const lines = response.split('\r\n');
      if (lines.length > 1) {
        const lastCompleteLine = lines[lines.length - 2];
        if (lastCompleteLine && lastCompleteLine.length >= 4) {
          const code = lastCompleteLine.substring(0, 3);
          const separator = lastCompleteLine.charAt(3);
          if (/^\d{3}$/.test(code) && separator === ' ') {
            break;
          }
        }
      }
      attempts++;
    }
    
    return response.trim();
  }
}

// Email template generator
function generateEmailTemplate(data: {
  participant_name: string;
  message?: string;
  certificate_number?: string;
  certificate_url: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Certificate</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎓 Congratulations!</h1>
        <h2>Certificate of Completion</h2>
    </div>
    <div class="content">
        <p>Dear ${data.participant_name},</p>
        
        <p>${data.message || 'Congratulations on successfully completing the course! Your dedication and hard work have paid off.'}</p>
        
        <p>Your certificate is now ready for download:</p>
        
        <div style="text-align: center;">
            <a href="${data.certificate_url}" class="button" target="_blank">
                📜 Download Your Certificate
            </a>
        </div>
        
        ${data.certificate_number ? `<p><strong>Certificate Number:</strong> ${data.certificate_number}</p>` : ''}
        
        <p>Please save this certificate for your records. You can print it or share it digitally as proof of your achievement.</p>
        
        <p>Thank you for your participation, and we wish you continued success in your learning journey!</p>
        
        <p>Best regards,<br>
        <strong>Metascholar Institute</strong></p>
    </div>
    <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>© 2025 Metascholar Institute. All rights reserved.</p>
    </div>
</body>
</html>
  `.trim();
}

// Background task for sending email
async function sendEmailInBackground(emailData: {
  to: string;
  subject: string;
  participant_name: string;
  message?: string;
  certificate_number?: string;
  certificate_url: string;
}): Promise<void> {
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  if (!smtpPassword) {
    console.error('SMTP_PASSWORD not configured');
    return;
  }

  const smtpClient = new TitanSMTPClient({
    hostname: 'smtp.titan.email',
    port: 465,
    username: 'support@academicdigital.space',
    password: smtpPassword,
  });

  const htmlContent = generateEmailTemplate({
    participant_name: emailData.participant_name,
    message: emailData.message,
    certificate_number: emailData.certificate_number,
    certificate_url: emailData.certificate_url,
  });

  try {
    console.log(`[Background] Sending email to ${emailData.to}...`);
    
    await smtpClient.connect();
    await smtpClient.sendEmail({
      from: 'support@academicdigital.space',
      to: emailData.to,
      subject: emailData.subject || `Your Certificate - ${emailData.participant_name}`,
      html: htmlContent,
    });
    await smtpClient.disconnect();
    
    console.log(`[Background] Email sent successfully to ${emailData.to}`);
  } catch (error) {
    console.error(`[Background] Failed to send email to ${emailData.to}:`, error);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { to, subject, message, participant_name, certificate_number, certificate_url }: EmailRequest = await req.json();
    
    console.log('Certificate email request:', { to, participant_name, certificate_number });

    // Validate required fields
    if (!to || !participant_name || !certificate_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, participant_name, certificate_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email address
    if (!to.includes('@') || !to.includes('.')) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start background email task
    EdgeRuntime.waitUntil(sendEmailInBackground({
      to,
      subject,
      participant_name,
      message,
      certificate_number,
      certificate_url,
    }));

    // Return immediate response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Certificate email queued for sending',
        details: { 
          to, 
          participant_name, 
          certificate_number,
          status: 'queued'
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Request handling error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process certificate email request',
        details: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);