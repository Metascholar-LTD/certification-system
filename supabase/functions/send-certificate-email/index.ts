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

// Optimized SMTP client for smtp.titan.email
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

  async sendEmail(emailData: { from: string; to: string; subject: string; html: string; pdfData?: string; participantName?: string }): Promise<void> {
    if (!this.conn) throw new Error('Not connected to SMTP server');

    try {
      console.log('📧 Starting SMTP email transaction...');
      console.log(`📬 From: ${emailData.from} → To: ${emailData.to}`);
      
      // EHLO command
      console.log('🤝 Sending EHLO...');
      await this.sendCommand('EHLO', this.config.hostname, '250');
      
      // AUTH LOGIN
      console.log('🔐 Starting authentication...');
      await this.sendCommand('AUTH', 'LOGIN', '334');
      
      // Username (base64)
      await this.sendCommand(btoa(this.config.username), '', '334');
      
      // Password (base64)
      await this.sendCommand(btoa(this.config.password), '', '235');
      console.log('✅ Authentication successful');
      
      // MAIL FROM
      await this.sendCommand('MAIL', `FROM:<${emailData.from}>`, '250');
      
      // RCPT TO
      await this.sendCommand('RCPT', `TO:<${emailData.to}>`, '250');
      
      // DATA command
      console.log('📄 Preparing to send email content...');
      await this.sendCommand('DATA', '', '354');
      
      // Build email content
      const emailContent = this.buildEmailMessage({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        pdfData: emailData.pdfData,
        participantName: emailData.participantName
      });
      console.log(`📦 Email content size: ${emailContent.length} characters`);
      
      // Send email content in chunks for large emails
      await this.sendEmailContent(emailContent);
      
      // Send termination sequence
      console.log('🏁 Sending email termination...');
      await this.conn.write(this.encoder.encode('\r\n.\r\n'));
      
      // Read final response
      const finalResponse = await this.readResponse();
      console.log('📨 Final SMTP response:', finalResponse);
      
      if (!finalResponse.startsWith('250')) {
        throw new Error(`Email delivery failed: ${finalResponse}`);
      }
      
      console.log('🎉 Email sent successfully!');
      
    } catch (error) {
      console.error('💥 SMTP transaction failed:', error);
      throw error;
    }
  }

  private async sendEmailContent(content: string): Promise<void> {
    const chunkSize = 64 * 1024; // 64KB chunks
    const totalSize = content.length;
    
    if (totalSize > chunkSize) {
      console.log(`📚 Sending large email in chunks (${Math.ceil(totalSize / chunkSize)} chunks)`);
      
      for (let i = 0; i < totalSize; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        await this.conn!.write(this.encoder.encode(chunk));
        
        // Small delay between chunks
        if (i + chunkSize < totalSize) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } else {
      await this.conn!.write(this.encoder.encode(content));
    }
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

  private async sendCommand(command: string, parameter: string, expectedCode: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    
    const fullCommand = parameter ? `${command} ${parameter}` : command;
    const isPassword = fullCommand.includes(btoa(this.config.password));
    const isUsername = fullCommand.includes(btoa(this.config.username));
    
    const logCommand = isPassword ? '[PASSWORD]' : 
                      isUsername ? '[USERNAME]' : fullCommand;
    
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

  private buildEmailMessage(emailData: { from: string; to: string; subject: string; html: string; pdfData?: string; participantName?: string }): string {
    if (!emailData.pdfData) {
      // Email without PDF attachment
      return [
        `From: ${emailData.from}`,
        `To: ${emailData.to}`,
        `Subject: ${emailData.subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        emailData.html
      ].join('\r\n');
    }

    // Email with PDF attachment - improved MIME formatting
    const boundary = '----=_NextPart_' + Math.random().toString(36).substring(2);
    
    console.log(`📄 [Debug] Building MIME email with boundary: ${boundary}`);
    console.log(`📄 [Debug] Raw PDF data length: ${emailData.pdfData.length} chars`);
    
    // Generate proper filename with participant name
    const safeName = emailData.participantName ? 
      emailData.participantName.replace(/[^a-zA-Z0-9]/g, '_') : 
      'participant';
    const filename = `Certificate_${safeName}.pdf`;
    
    return [
      `From: ${emailData.from}`,
      `To: ${emailData.to}`,
      `Subject: ${emailData.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      emailData.html,
      '',
      `--${boundary}`,
      'Content-Type: application/pdf; name="' + filename + '"',
      'Content-Disposition: attachment; filename="' + filename + '"',
      'Content-Transfer-Encoding: base64',
      '',
      emailData.pdfData,
      '',
      `--${boundary}--`
    ].join('\r\n');
  }

}

// Email template with PDF certificate link
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
        .button { 
            background: #667eea; 
            color: white !important; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            display: inline-block; 
            margin: 20px 0; 
            font-weight: bold;
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
            <p><strong>🏆 Your certificate is now ready for download!</strong></p>
            ${data.certificate_number ? `<p><strong>Certificate Number:</strong> ${data.certificate_number}</p>` : ''}
        </div>
        
        <div style="text-align: center; background: #fff; padding: 20px; border-radius: 8px; border: 2px solid #667eea;">
            <p><strong>📎 Your certificate is attached to this email as a PDF file.</strong></p>
            <p>Look for the PDF attachment in your email client to download and save your certificate.</p>
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
      
      // Extract PDF base64 data from data URL
      let pdfData = '';
      
      console.log(`🔍 [Debug] Certificate URL format: ${emailData.certificate_url.substring(0, 100)}...`);
      console.log(`🔍 [Debug] Certificate URL length: ${emailData.certificate_url.length}`);
      
      if (emailData.certificate_url.startsWith('data:application/pdf;base64,')) {
        pdfData = emailData.certificate_url.split(',')[1];
        console.log(`✅ [Debug] Extracted PDF base64 data length: ${pdfData.length}`);
        console.log(`🔍 [Debug] First 100 chars of base64: ${pdfData.substring(0, 100)}`);
        
        // Validate that we have actual PDF data
        if (!pdfData || pdfData.length === 0) {
          console.error(`❌ [Debug] Empty PDF data extracted`);
          throw new Error('PDF data is empty');
        }
        
        // Clean up base64 data - remove any whitespace or line breaks
        pdfData = pdfData.replace(/\s/g, '');
        
        // Basic validation - PDF files should start with %PDF when decoded
        try {
          const firstBytes = atob(pdfData.substring(0, 8));
          if (!firstBytes.startsWith('%PDF')) {
            console.warn(`⚠️ [Debug] Warning: Data doesn't appear to be a valid PDF (first bytes: ${firstBytes})`);
          } else {
            console.log(`✅ [Debug] Valid PDF data detected`);
          }
        } catch (e) {
          console.warn(`⚠️ [Debug] Could not validate PDF header: ${e}`);
        }
        
        // Ensure base64 is properly formatted for email (no line breaks in the middle)
        // Base64 should be continuous without line breaks for email attachments
        console.log(`✅ [Debug] Cleaned PDF base64 data length: ${pdfData.length}`);
        
        // Final validation - ensure we have valid base64 data
        if (pdfData.length < 100) {
          console.error(`❌ [Debug] PDF data too short: ${pdfData.length} chars`);
          throw new Error('PDF data appears to be corrupted or too small');
        }
        
        // Validate base64 format
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(pdfData)) {
          console.error(`❌ [Debug] Invalid base64 format detected`);
          throw new Error('PDF data is not in valid base64 format');
        }
        
        console.log(`✅ [Debug] PDF data validation passed`);
        
      } else {
        console.error(`❌ [Debug] Invalid certificate format. Expected PDF data URL, got: ${emailData.certificate_url.substring(0, 50)}`);
        throw new Error('Only PDF certificates are supported');
      }

      console.log(`📧 [Debug] Sending email with PDF data length: ${pdfData.length}`);
      console.log(`📧 [Debug] Participant name: ${emailData.participant_name}`);
      
      await smtpClient.sendEmail({
        from: 'Metascholar Institute - Workshop Certification <support@academicdigital.space>',
        to: emailData.to,
        subject: emailData.subject || `Your Certificate - ${emailData.participant_name}`,
        html: htmlContent,
        pdfData: pdfData,
        participantName: emailData.participant_name,
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
    if (!to || !participant_name) {
      console.error('❌ Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, participant_name' }),
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

    // Validate certificate URL (only if provided)
    if (certificate_url && !certificate_url.startsWith('data:')) {
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