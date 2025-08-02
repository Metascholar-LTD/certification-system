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

  constructor(config: { hostname: string; port: number; username: string; password: string }) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.conn = await Deno.connectTls({
      hostname: this.config.hostname,
      port: this.config.port,
    });

    // Read server greeting
    const greeting = await this.readResponse();
    console.log('Server greeting:', greeting);
    
    if (!greeting.startsWith('220')) {
      throw new Error(`Connection failed: ${greeting}`);
    }
  }

  async sendEmail(emailData: { from: string; to: string; subject: string; html: string }): Promise<void> {
    if (!this.conn) throw new Error('Not connected');

    // EHLO
    await this.sendCommand('EHLO ' + this.config.hostname);
    
    // AUTH LOGIN
    await this.sendCommand('AUTH LOGIN');
    
    // Username (base64)
    await this.sendCommand(btoa(this.config.username));
    
    // Password (base64)
    await this.sendCommand(btoa(this.config.password));
    
    // MAIL FROM
    await this.sendCommand(`MAIL FROM:<${emailData.from}>`);
    
    // RCPT TO
    await this.sendCommand(`RCPT TO:<${emailData.to}>`);
    
    // DATA
    await this.sendCommand('DATA');
    
    // Email content
    const emailContent = [
      `From: ${emailData.from}`,
      `To: ${emailData.to}`,
      `Subject: ${emailData.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      emailData.html,
      '.'
    ].join('\r\n');
    
    await this.conn.write(new TextEncoder().encode(emailContent + '\r\n'));
    
    const finalResponse = await this.readResponse();
    console.log('Final response:', finalResponse);
    
    if (!finalResponse.startsWith('250')) {
      throw new Error(`Email sending failed: ${finalResponse}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      try {
        await this.sendCommand('QUIT');
      } catch (e) {
        console.warn('Error during QUIT:', e);
      }
      this.conn.close();
      this.conn = null;
    }
  }

  private async sendCommand(command: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    
    console.log('>', command.startsWith('AUTH LOGIN') ? 'AUTH LOGIN' : command);
    await this.conn.write(new TextEncoder().encode(command + '\r\n'));
    
    const response = await this.readResponse();
    console.log('<', response);
    
    // Check for error responses
    if (command.startsWith('EHLO') && !response.startsWith('250')) {
      throw new Error(`EHLO failed: ${response}`);
    }
    if (command.startsWith('AUTH LOGIN') && !response.startsWith('334')) {
      throw new Error(`AUTH LOGIN failed: ${response}`);
    }
    if (command === btoa(this.config.username) && !response.startsWith('334')) {
      throw new Error(`Username auth failed: ${response}`);
    }
    if (command === btoa(this.config.password) && !response.startsWith('235')) {
      throw new Error(`Password auth failed: ${response}`);
    }
    if (command.startsWith('MAIL FROM') && !response.startsWith('250')) {
      throw new Error(`MAIL FROM failed: ${response}`);
    }
    if (command.startsWith('RCPT TO') && !response.startsWith('250')) {
      throw new Error(`RCPT TO failed: ${response}`);
    }
    if (command.startsWith('DATA') && !response.startsWith('354')) {
      throw new Error(`DATA failed: ${response}`);
    }
  }

  private async readResponse(): Promise<string> {
    if (!this.conn) throw new Error('Not connected');
    
    const buffer = new Uint8Array(4096);
    let response = '';
    
    while (true) {
      const n = await this.conn.read(buffer);
      if (n === null) break;
      
      response += new TextDecoder().decode(buffer.subarray(0, n));
      
      // Check if response is complete
      if (response.includes('\r\n')) {
        const lines = response.split('\r\n');
        const lastLine = lines[lines.length - 2]; // -2 because last element is empty after split
        if (lastLine && lastLine.length >= 4) {
          const code = lastLine.substring(0, 3);
          const separator = lastLine.charAt(3);
          if (/^\d{3}$/.test(code) && separator === ' ') {
            break;
          }
        }
      }
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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { to, subject, message, participant_name, certificate_number, certificate_url }: EmailRequest = await req.json();
    
    console.log('Email request received:', { to, participant_name, certificate_number });

    // Validate required fields
    if (!to || !participant_name || !certificate_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, participant_name, certificate_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email address
    if (!to.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const smtpPassword = Deno.env.get('SMTP_PASSWORD');
    if (!smtpPassword) {
      throw new Error('SMTP_PASSWORD environment variable not configured');
    }

    // Create SMTP client
    const smtpClient = new TitanSMTPClient({
      hostname: 'smtp.titan.email',
      port: 465,
      username: 'support@academicdigital.space',
      password: smtpPassword,
    });

    // Generate email content
    const htmlContent = generateEmailTemplate({
      participant_name,
      message,
      certificate_number,
      certificate_url,
    });

    console.log('Connecting to SMTP server...');
    await smtpClient.connect();

    console.log('Sending email...');
    await smtpClient.sendEmail({
      from: 'support@academicdigital.space',
      to: to,
      subject: subject || `Your Certificate - ${participant_name}`,
      html: htmlContent,
    });

    console.log('Disconnecting...');
    await smtpClient.disconnect();

    console.log('Email sent successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Certificate email sent successfully',
        details: { to, from: 'support@academicdigital.space', certificate_number },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Email sending error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to send certificate email',
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