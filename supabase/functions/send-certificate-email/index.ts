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

interface EmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  certificate_url?: string;
  participant_name?: string;
}

// Optimized SMTP client for smtp.titan.email with PDF attachment support
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
    console.log(`🔌 Connecting to ${this.config.hostname}:${this.config.port}...`);
    
    try {
      this.conn = await Deno.connectTls({
        hostname: this.config.hostname,
        port: this.config.port,
      });

      const greeting = await this.readResponse();
      console.log('📡 Server greeting:', greeting.substring(0, 100));
      
      if (!greeting.startsWith('220')) {
        throw new Error(`SMTP connection rejected: ${greeting}`);
      }
      
      console.log('✅ SMTP connection established');
    } catch (error) {
      console.error('❌ SMTP connection failed:', error);
      throw error;
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    
    console.log(`📧 Starting SMTP email transaction...`);
    console.log(`📬 From: ${options.from} → To: ${options.to}`);
    
    // EHLO command
    await this.sendCommand('EHLO', 'smtp.titan.email', '250');
    
    console.log('🔐 Starting authentication...');
    await this.sendCommand('AUTH', 'LOGIN', '334');
    
    // Send username (base64 encoded)
    const username = btoa(this.config.username);
    await this.sendCommand('', username, '334', '[USERNAME]');
    
    // Send password (base64 encoded)
    const password = btoa(this.config.password);
    await this.sendCommand('', password, '235', '[PASSWORD]');
    
    console.log('✅ Authentication successful');
    
    // MAIL FROM
    await this.sendCommand('MAIL FROM', `<${options.from}>`, '250');
    
    // RCPT TO
    await this.sendCommand('RCPT TO', `<${options.to}>`, '250');
    
    // DATA command
    console.log('📄 Preparing to send email content...');
    await this.sendCommand('DATA', '', '354');
    
    // Create email content with attachment if certificate_url is provided
    let emailContent: string;
    
    if (options.certificate_url && options.certificate_url.startsWith('data:')) {
      // Extract attachment data
      let base64Data: string;
      let mimeType: string;
      let fileExtension: string;
      let filename: string;
      
      if (options.certificate_url.startsWith('data:application/pdf;base64,')) {
        base64Data = options.certificate_url.replace('data:application/pdf;base64,', '');
        mimeType = 'application/pdf';
        fileExtension = 'pdf';
      } else if (options.certificate_url.startsWith('data:image/')) {
        const matches = options.certificate_url.match(/^data:image\/([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = `image/${matches[1]}`;
          base64Data = matches[2];
          fileExtension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        } else {
          throw new Error('Invalid image data URL format');
        }
      } else {
        throw new Error('Unsupported certificate format');
      }
      
      filename = `Certificate_${(options.participant_name || 'User').replace(/\s+/g, '_')}.${fileExtension}`;
      const boundary = `----formdata-lovable-${Date.now()}`;
      
      emailContent = `To: ${options.to}
From: ${options.from}
Subject: ${options.subject}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 7bit

${options.html}

--${boundary}
Content-Type: ${mimeType}
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${filename}"

${base64Data}
--${boundary}--`;
    } else {
      // Simple HTML email without attachment
      emailContent = `To: ${options.to}
From: ${options.from}
Subject: ${options.subject}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8

${options.html}`;
    }
    
    console.log(`📦 Email content size: ${emailContent.length} characters`);
    
    // Send content in chunks for large emails
    const chunkSize = 64000; // 64KB chunks
    const chunks = Math.ceil(emailContent.length / chunkSize);
    
    if (chunks > 1) {
      console.log(`📚 Sending large email in chunks (${chunks} chunks)`);
    }
    
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, emailContent.length);
      const chunk = emailContent.slice(start, end);
      
      await this.conn.write(this.encoder.encode(chunk));
    }
    
    // End data with CRLF.CRLF
    console.log('🏁 Sending email termination...');
    await this.conn.write(this.encoder.encode('\r\n.\r\n'));
    
    // Read final response
    const finalResponse = await this.readResponse();
    console.log(`📨 Final SMTP response: ${finalResponse.substring(0, 100)}`);
    
    if (!finalResponse.startsWith('250')) {
      throw new Error(`Email sending failed: ${finalResponse}`);
    }
    
    console.log('🎉 Email sent successfully!');
  }

  private async sendCommand(command: string, parameter: string, expectedCode: string, logOverride?: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    
    const fullCommand = parameter ? `${command} ${parameter}` : command;
    const logCommand = logOverride || fullCommand;
    
    console.log('📤 SMTP >', logCommand);
    
    // Send command
    await this.conn.write(this.encoder.encode(fullCommand + '\r\n'));
    
    // Read response
    const response = await this.readResponse();
    console.log('📥 SMTP <', response.substring(0, 150));
    
    // Validate response
    if (!response.startsWith(expectedCode)) {
      throw new Error(`SMTP command failed: ${command} - Expected ${expectedCode}, got: ${response}`);
    }
  }

  private async readResponse(): Promise<string> {
    if (!this.conn) throw new Error('Not connected');
    
    const buffer = new Uint8Array(8192);
    let response = '';
    let attempts = 0;
    const maxAttempts = 50; // Increased for large emails
    
    while (attempts < maxAttempts) {
      try {
        const n = await this.conn.read(buffer);
        if (n === null) {
          console.log('📡 Connection closed by server');
          break;
        }
        
        const chunk = this.decoder.decode(buffer.subarray(0, n));
        response += chunk;
        
        // Check for complete SMTP response
        const lines = response.split('\r\n');
        
        // Look for a line with status code and space separator (end of multi-line response)
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (line && line.length >= 4) {
            const code = line.substring(0, 3);
            const separator = line.charAt(3);
            
            if (/^\d{3}$/.test(code) && separator === ' ') {
              return response.trim();
            }
          }
        }
        
        attempts++;
        
        // Progressive delay for large responses
        if (attempts < maxAttempts) {
          const delay = Math.min(50 + attempts * 2, 200);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        console.error(`📡 Read attempt ${attempts} failed:`, error);
        attempts++;
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      console.warn(`⏰ Max attempts reached. Response so far: ${response.substring(0, 200)}`);
    }
    
    return response.trim();
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      try {
        console.log('👋 Disconnecting from SMTP server...');
        await this.sendCommand('QUIT', '', '221');
      } catch (e) {
        console.warn('⚠️ QUIT command failed:', e);
      } finally {
        this.conn.close();
        this.conn = null;
        console.log('🔌 SMTP connection closed');
      }
    }
  }
}

// Email template that mentions the PDF attachment
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
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px; 
            text-align: center; 
            border-radius: 10px 10px 0 0; 
        }
        .content { 
            background: #f9f9f9; 
            padding: 30px; 
            border-radius: 0 0 10px 10px; 
            border: 1px solid #e0e0e0;
        }
        .attachment-notice { 
            background: #e8f4fd; 
            color: #1976d2; 
            padding: 20px; 
            border-radius: 8px; 
            border-left: 4px solid #1976d2;
            margin: 20px 0;
            text-align: center;
        }
        .footer { 
            text-align: center; 
            color: #666; 
            font-size: 12px; 
            margin-top: 30px; 
            border-top: 1px solid #e0e0e0;
            padding-top: 20px;
        }
        .certificate-info {
            background: #fff;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
            border-left: 4px solid #667eea;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎓 Congratulations!</h1>
        <h2>Certificate of Completion</h2>
    </div>
    <div class="content">
        <p>Dear <strong>${data.participant_name}</strong>,</p>
        
        <p>${data.message || 'Congratulations on successfully completing the course! Your dedication and hard work have paid off.'}</p>
        
        <div class="certificate-info">
            <p><strong>🏆 Your certificate is ready!</strong></p>
            ${data.certificate_number ? `<p><strong>Certificate Number:</strong> ${data.certificate_number}</p>` : ''}
        </div>
        
        <div class="attachment-notice">
            <h3>📎 Certificate Attached</h3>
            <p><strong>Your certificate is attached to this email as a PDF file.</strong></p>
            <p>Please check your email attachments to download and save your certificate.</p>
        </div>
        
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

// Background email sending with improved error handling
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
    console.error('❌ SMTP_PASSWORD environment variable not configured');
    return;
  }

  console.log(`📧 [Background] Starting email send to: ${emailData.to}`);
  console.log(`👤 [Background] Participant: ${emailData.participant_name}`);
  console.log(`🔗 [Background] Certificate URL length: ${emailData.certificate_url.length} chars`);

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

  console.log(`📄 [Background] Generated email content: ${htmlContent.length} characters`);

  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      console.log(`🔄 [Background] Attempt ${retryCount + 1}/${maxRetries}`);
      
      await smtpClient.connect();
      
      await smtpClient.sendEmail({
        from: 'support@academicdigital.space',
        to: emailData.to,
        subject: emailData.subject || `Your Certificate - ${emailData.participant_name}`,
        html: htmlContent,
        certificate_url: emailData.certificate_url,
        participant_name: emailData.participant_name,
      });
      
      await smtpClient.disconnect();
      
      console.log(`✅ [Background] Email successfully sent to ${emailData.to}`);
      return; // Success - exit retry loop
      
    } catch (error) {
      console.error(`❌ [Background] Attempt ${retryCount + 1} failed:`, error);
      
      // Clean up connection on error
      try {
        await smtpClient.disconnect();
      } catch (disconnectError) {
        console.warn('⚠️ [Background] Disconnect error:', disconnectError);
      }
      
      retryCount++;
      
      if (retryCount < maxRetries) {
        const delay = 1000 * retryCount; // Progressive delay
        console.log(`⏳ [Background] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`💥 [Background] All ${maxRetries} attempts failed for ${emailData.to}`);
        throw error;
      }
    }
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
    
    console.log('📨 Certificate email request received:', { 
      to, 
      participant_name, 
      certificate_number,
      certificate_url_length: certificate_url?.length || 0
    });

    // Validate required fields
    if (!to || !participant_name || !certificate_url) {
      console.error('❌ Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, participant_name, certificate_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    if (!to.includes('@') || !to.includes('.')) {
      console.error('❌ Invalid email format:', to);
      return new Response(
        JSON.stringify({ error: 'Invalid email address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate certificate URL
    if (!certificate_url.startsWith('data:')) {
      console.error('❌ Invalid certificate URL format - expected data URL');
      return new Response(
        JSON.stringify({ error: 'Invalid certificate URL format' }),
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

    // Return immediate success response
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
    console.error('❌ Request handling error:', error);
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