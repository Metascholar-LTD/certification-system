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

// Simple SMTP client specifically for sending PDF certificates
class SimpleSMTPClient {
  private conn: Deno.TlsConn | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(
    private config: {
      hostname: string;
      port: number;
      username: string;
      password: string;
    }
  ) {}

  async connect(): Promise<void> {
    console.log(`🔌 Connecting to ${this.config.hostname}:${this.config.port}...`);
    
    this.conn = await Deno.connectTls({
      hostname: this.config.hostname,
      port: this.config.port,
    });

    const greeting = await this.readResponse();
    console.log('📡 Server greeting:', greeting);
    
    if (!greeting.startsWith('220')) {
      throw new Error(`SMTP connection rejected: ${greeting}`);
    }
    
    console.log('✅ SMTP connection established');
  }

  async sendEmail(data: {
    from: string;
    to: string;
    subject: string;
    html: string;
    pdfBase64: string;
    filename: string;
  }): Promise<void> {
    if (!this.conn) throw new Error('Not connected to SMTP server');

    console.log(`📧 Sending email from ${data.from} to ${data.to}`);
    
    // EHLO
    await this.sendCommand('EHLO', this.config.hostname);
    
    // Auth
    await this.sendCommand('AUTH', 'LOGIN');
    await this.sendCommand(btoa(this.config.username));
    await this.sendCommand(btoa(this.config.password));
    console.log('✅ Authentication successful');
    
    // Mail transaction
    const fromEmail = data.from.includes('<') ? 
      data.from.match(/<(.+?)>/)?.[1] || data.from : data.from;
    await this.sendCommand('MAIL', `FROM:<${fromEmail}>`);
    await this.sendCommand('RCPT', `TO:<${data.to}>`);
    await this.sendCommand('DATA');
    
    // Send email content
    const emailContent = this.buildMimeMessage(data);
    console.log(`📦 Sending email content (${emailContent.length} chars)`);
    
    await this.conn.write(this.encoder.encode(emailContent));
    await this.conn.write(this.encoder.encode('\r\n.\r\n'));
    
    const response = await this.readResponse();
    console.log('📨 Final response:', response);
    
    if (!response.startsWith('250')) {
      throw new Error(`Email sending failed: ${response}`);
    }
    
    console.log('🎉 Email sent successfully!');
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      try {
        await this.sendCommand('QUIT');
      } catch (e) {
        console.warn('QUIT failed:', e);
      }
      this.conn.close();
      this.conn = null;
      console.log('🔌 Disconnected');
    }
  }

  private async sendCommand(command: string, parameter?: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    
    const fullCommand = parameter ? `${command} ${parameter}` : command;
    const isCredential = command.includes(btoa(this.config.username)) || 
                        command.includes(btoa(this.config.password));
    
    console.log('📤 SMTP >', isCredential ? '[CREDENTIAL]' : fullCommand);
    
    await this.conn.write(this.encoder.encode(fullCommand + '\r\n'));
    
    const response = await this.readResponse();
    console.log('📥 SMTP <', response.substring(0, 100));
  }

  private async readResponse(): Promise<string> {
    if (!this.conn) throw new Error('Not connected');
    
    const buffer = new Uint8Array(4096);
    let response = '';
    let attempts = 0;
    
    while (attempts < 20) {
      const n = await this.conn.read(buffer);
      if (n === null) break;
      
      const chunk = this.decoder.decode(buffer.subarray(0, n));
      response += chunk;
      
      // Check for complete response (status code followed by space)
      const lines = response.split('\r\n');
      for (const line of lines) {
        if (line && /^\d{3} /.test(line)) {
          return response.trim();
        }
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return response.trim();
  }

  private buildMimeMessage(data: {
    from: string;
    to: string;
    subject: string;
    html: string;
    pdfBase64: string;
    filename: string;
  }): string {
    const boundary = `----=NextPart_${Date.now()}_${Math.random().toString(36)}`;
    
    console.log(`📄 Building MIME message with boundary: ${boundary}`);
    console.log(`📄 PDF data length: ${data.pdfBase64.length} chars`);
    console.log(`📄 Using filename: ${data.filename}`);
    
    // Clean base64 data - remove any whitespace
    const cleanBase64 = data.pdfBase64.replace(/\s+/g, '');
    
    // Split base64 into 76-character lines for RFC compliance
    const base64Lines = cleanBase64.match(/.{1,76}/g) || [];
    const formattedBase64 = base64Lines.join('\r\n');
    
    return [
      `From: ${data.from}`,
      `To: ${data.to}`,
      `Subject: ${data.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `This is a multi-part message in MIME format.`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      data.html,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${data.filename}"`,
      `Content-Disposition: attachment; filename="${data.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      formattedBase64,
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }
}

function generateEmailTemplate(data: {
  participant_name: string;
  message?: string;
  certificate_number?: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Your Certificate</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background: #4f46e5; 
            color: white; 
            padding: 30px; 
            text-align: center; 
            border-radius: 8px 8px 0 0; 
        }
        .content { 
            background: #f9fafb; 
            padding: 30px; 
            border-radius: 0 0 8px 8px; 
            border: 1px solid #e5e7eb;
        }
        .certificate-info {
            background: #ffffff;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid #4f46e5;
        }
        .footer { 
            text-align: center; 
            color: #6b7280; 
            font-size: 14px; 
            margin-top: 30px; 
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
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
            <p><strong>🏆 Your certificate is now ready!</strong></p>
            ${data.certificate_number ? `<p><strong>Certificate Number:</strong> ${data.certificate_number}</p>` : ''}
            <p><strong>📎 Your certificate is attached to this email as a PDF file.</strong></p>
            <p>Look for the PDF attachment in your email client to download and save your certificate.</p>
        </div>
        
        <p>Please save this certificate for your records. You can print it or share it digitally as proof of your achievement.</p>
        
        <p>Thank you for your participation!</p>
        
        <p>Best regards,<br>
        <strong>Metascholar Institute</strong></p>
    </div>
    <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>© 2025 Metascholar Institute. All rights reserved.</p>
    </div>
</body>
</html>`.trim();
}

async function sendEmailInBackground(emailData: EmailRequest): Promise<void> {
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  if (!smtpPassword) {
    console.error('❌ SMTP_PASSWORD not configured');
    return;
  }

  console.log(`📧 [Background] Sending certificate to: ${emailData.to}`);
  console.log(`👤 [Background] Participant: ${emailData.participant_name}`);

  // Extract PDF data from data URL
  if (!emailData.certificate_url.startsWith('data:application/pdf;base64,')) {
    console.error('❌ Invalid certificate URL format');
    return;
  }

  const pdfBase64 = emailData.certificate_url.split(',')[1];
  console.log(`📄 [Background] PDF base64 length: ${pdfBase64.length}`);

  // Validate PDF data
  if (pdfBase64.length < 100) {
    console.error('❌ PDF data too small');
    return;
  }

  // Generate filename
  const safeName = emailData.participant_name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Certificate_${safeName}.pdf`;

  const smtpClient = new SimpleSMTPClient({
    hostname: 'smtp.titan.email',
    port: 465,
    username: 'support@academicdigital.space',
    password: smtpPassword,
  });

  const htmlContent = generateEmailTemplate({
    participant_name: emailData.participant_name,
    message: emailData.message,
    certificate_number: emailData.certificate_number,
  });

  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    try {
      attempt++;
      console.log(`🔄 [Background] Attempt ${attempt}/${maxAttempts}`);
      
      await smtpClient.connect();
      
      await smtpClient.sendEmail({
        from: 'Metascholar Institute - Workshop Certification <support@academicdigital.space>',
        to: emailData.to,
        subject: emailData.subject,
        html: htmlContent,
        pdfBase64: pdfBase64,
        filename: filename,
      });
      
      await smtpClient.disconnect();
      
      console.log(`✅ [Background] Email successfully sent to ${emailData.to}`);
      return;
      
    } catch (error) {
      console.error(`❌ [Background] Attempt ${attempt} failed:`, error);
      await smtpClient.disconnect();
      
      if (attempt < maxAttempts) {
        console.log('🔄 [Background] Retrying in 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.error(`❌ [Background] All attempts failed for ${emailData.to}`);
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
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
    const emailData: EmailRequest = await req.json();
    
    console.log('📨 Certificate email request received:', {
      to: emailData.to,
      participant_name: emailData.participant_name,
      certificate_number: emailData.certificate_number,
      certificate_url_length: emailData.certificate_url.length
    });

    // Validate required fields
    if (!emailData.to || !emailData.participant_name || !emailData.certificate_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailData.to)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate certificate URL format
    if (!emailData.certificate_url.startsWith('data:application/pdf;base64,')) {
      return new Response(
        JSON.stringify({ error: 'Invalid certificate URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start background email sending
    sendEmailInBackground(emailData).catch(error => {
      console.error('Background email sending failed:', error);
    });

    // Return immediate success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Certificate email queued for sending' 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Request processing error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);