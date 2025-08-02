import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  to: string;
  subject: string;
  content: string;
  participant_name: string;
  email_type?: 'welcome' | 'reminder' | 'update' | 'custom';
}

// Optimized SMTP client for participant messaging
class ParticipantSMTPClient {
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
    console.log(`🔌 [Messaging] Connecting to ${this.config.hostname}:${this.config.port}...`);
    
    try {
      this.conn = await Deno.connectTls({
        hostname: this.config.hostname,
        port: this.config.port,
      });

      const greeting = await this.readResponse();
      console.log('📡 [Messaging] Server greeting:', greeting.substring(0, 100));
      
      if (!greeting.startsWith('220')) {
        throw new Error(`SMTP connection rejected: ${greeting}`);
      }
      
      console.log('✅ [Messaging] SMTP connection established');
    } catch (error) {
      console.error('❌ [Messaging] SMTP connection failed:', error);
      throw error;
    }
  }

  async sendEmail(emailData: { from: string; to: string; subject: string; html: string }): Promise<void> {
    if (!this.conn) throw new Error('Not connected to SMTP server');

    try {
      console.log('📧 [Messaging] Starting SMTP email transaction...');
      console.log(`📬 [Messaging] From: ${emailData.from} → To: ${emailData.to}`);
      
      // EHLO command
      await this.sendCommand('EHLO', this.config.hostname, '250');
      
      // AUTH LOGIN
      await this.sendCommand('AUTH', 'LOGIN', '334');
      
      // Username (base64)
      await this.sendCommand(btoa(this.config.username), '', '334');
      
      // Password (base64)
      await this.sendCommand(btoa(this.config.password), '', '235');
      console.log('✅ [Messaging] Authentication successful');
      
      // MAIL FROM
      await this.sendCommand('MAIL', `FROM:<${emailData.from}>`, '250');
      
      // RCPT TO
      await this.sendCommand('RCPT', `TO:<${emailData.to}>`, '250');
      
      // DATA command
      await this.sendCommand('DATA', '', '354');
      
      // Build and send email content
      const emailContent = this.buildEmailMessage(emailData);
      console.log(`📦 [Messaging] Email content size: ${emailContent.length} characters`);
      
      await this.sendEmailContent(emailContent);
      
      // Send termination sequence
      await this.conn.write(this.encoder.encode('\r\n.\r\n'));
      
      // Read final response
      const finalResponse = await this.readResponse();
      console.log('📨 [Messaging] Final SMTP response:', finalResponse);
      
      if (!finalResponse.startsWith('250')) {
        throw new Error(`Email delivery failed: ${finalResponse}`);
      }
      
      console.log('🎉 [Messaging] Email sent successfully!');
      
    } catch (error) {
      console.error('💥 [Messaging] SMTP transaction failed:', error);
      throw error;
    }
  }

  private async sendEmailContent(content: string): Promise<void> {
    const chunkSize = 64 * 1024; // 64KB chunks
    const totalSize = content.length;
    
    if (totalSize > chunkSize) {
      console.log(`📚 [Messaging] Sending large email in chunks (${Math.ceil(totalSize / chunkSize)} chunks)`);
      
      for (let i = 0; i < totalSize; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        await this.conn!.write(this.encoder.encode(chunk));
        
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
        console.log('👋 [Messaging] Disconnecting from SMTP server...');
        await this.sendCommand('QUIT', '', '221');
      } catch (e) {
        console.warn('⚠️ [Messaging] QUIT command failed:', e);
      } finally {
        this.conn.close();
        this.conn = null;
        console.log('🔌 [Messaging] SMTP connection closed');
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
    
    console.log('📤 [Messaging] SMTP >', logCommand);
    
    await this.conn.write(this.encoder.encode(fullCommand + '\r\n'));
    
    const response = await this.readResponse();
    console.log('📥 [Messaging] SMTP <', response.substring(0, 150));
    
    if (!response.startsWith(expectedCode)) {
      throw new Error(`SMTP command failed: ${command} - Expected ${expectedCode}, got: ${response}`);
    }
  }

  private async readResponse(): Promise<string> {
    if (!this.conn) throw new Error('Not connected');
    
    const buffer = new Uint8Array(8192);
    let response = '';
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        const n = await this.conn.read(buffer);
        if (n === null) {
          console.log('📡 [Messaging] Connection closed by server');
          break;
        }
        
        const chunk = this.decoder.decode(buffer.subarray(0, n));
        response += chunk;
        
        const lines = response.split('\r\n');
        
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
        
        if (attempts < maxAttempts) {
          const delay = Math.min(50 + attempts * 2, 200);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        console.error(`📡 [Messaging] Read attempt ${attempts} failed:`, error);
        attempts++;
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      console.warn(`⏰ [Messaging] Max attempts reached. Response so far: ${response.substring(0, 200)}`);
    }
    
    return response.trim();
  }

  private buildEmailMessage(emailData: { from: string; to: string; subject: string; html: string }): string {
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
}

// Enhanced email template generator for participant messaging
function generateParticipantEmailTemplate(data: {
  participant_name: string;
  content: string;
  email_type?: string;
}): string {
  const { participant_name, content, email_type = 'custom' } = data;
  
  // Get email type specific styling
  const getEmailTypeIcon = (type: string) => {
    switch (type) {
      case 'welcome': return '🎉';
      case 'reminder': return '⏰';
      case 'update': return '📢';
      default: return '📧';
    }
  };

  const getEmailTypeColor = (type: string) => {
    switch (type) {
      case 'welcome': return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      case 'reminder': return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
      case 'update': return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
      default: return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  };

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Message from Metascholar Institute</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
            background-color: #f8fafc;
        }
        .email-container {
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        .header { 
            background: ${getEmailTypeColor(email_type)}; 
            color: white; 
            padding: 40px 30px; 
            text-align: center; 
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .header p {
            margin: 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .content { 
            padding: 40px 30px; 
            background: white;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            color: #1a202c;
            margin-bottom: 20px;
        }
        .message-content {
            font-size: 16px;
            line-height: 1.6;
            color: #4a5568;
            white-space: pre-wrap;
            margin-bottom: 30px;
        }
        .signature {
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
            margin-top: 30px;
        }
        .signature p {
            margin: 0;
            color: #718096;
            font-size: 14px;
        }
        .signature .company {
            font-weight: 600;
            color: #2d3748;
            font-size: 16px;
        }
        .footer { 
            text-align: center; 
            color: #a0aec0; 
            font-size: 12px; 
            padding: 20px 30px;
            background: #f7fafc;
            border-top: 1px solid #e2e8f0;
        }
        .footer p {
            margin: 5px 0;
        }
        .badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            margin-top: 8px;
        }
        @media (max-width: 600px) {
            body {
                padding: 10px;
            }
            .header {
                padding: 30px 20px;
            }
            .content {
                padding: 30px 20px;
            }
            .header h1 {
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>${getEmailTypeIcon(email_type)} Metascholar Institute</h1>
            <p>Learning Excellence, Delivered</p>
            <div class="badge">Official Communication</div>
        </div>
        
        <div class="content">
            <div class="greeting">Hello ${participant_name},</div>
            
            <div class="message-content">${content}</div>
            
            <div class="signature">
                <p class="company">Metascholar Institute</p>
                <p>Empowering Learning, Inspiring Growth</p>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated message from Metascholar Institute.</p>
            <p>© 2025 Metascholar Institute. All rights reserved.</p>
            <p>You received this email because you are a registered participant.</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

// Background email sending for participant messaging
async function sendParticipantEmailInBackground(emailData: {
  to: string;
  subject: string;
  content: string;
  participant_name: string;
  email_type?: string;
}): Promise<void> {
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  if (!smtpPassword) {
    console.error('❌ [Messaging] SMTP_PASSWORD environment variable not configured');
    return;
  }

  console.log(`📧 [Messaging] Starting email send to: ${emailData.to}`);
  console.log(`👤 [Messaging] Participant: ${emailData.participant_name}`);
  console.log(`📝 [Messaging] Email type: ${emailData.email_type || 'custom'}`);

  const smtpClient = new ParticipantSMTPClient({
    hostname: 'smtp.titan.email',
    port: 465,
    username: 'support@academicdigital.space',
    password: smtpPassword,
  });

  const htmlContent = generateParticipantEmailTemplate({
    participant_name: emailData.participant_name,
    content: emailData.content,
    email_type: emailData.email_type,
  });

  console.log(`📄 [Messaging] Generated email content: ${htmlContent.length} characters`);

  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      console.log(`🔄 [Messaging] Attempt ${retryCount + 1}/${maxRetries}`);
      
      await smtpClient.connect();
      
      await smtpClient.sendEmail({
        from: 'support@academicdigital.space',
        to: emailData.to,
        subject: emailData.subject,
        html: htmlContent,
      });
      
      await smtpClient.disconnect();
      
      console.log(`✅ [Messaging] Email successfully sent to ${emailData.to}`);
      return; // Success - exit retry loop
      
    } catch (error) {
      console.error(`❌ [Messaging] Attempt ${retryCount + 1} failed:`, error);
      
      // Clean up connection on error
      try {
        await smtpClient.disconnect();
      } catch (disconnectError) {
        console.warn('⚠️ [Messaging] Disconnect error:', disconnectError);
      }
      
      retryCount++;
      
      if (retryCount < maxRetries) {
        const delay = 1000 * retryCount; // Progressive delay
        console.log(`⏳ [Messaging] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`💥 [Messaging] All ${maxRetries} attempts failed for ${emailData.to}`);
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
    const { to, subject, content, participant_name, email_type }: EmailRequest = await req.json();
    
    console.log('📨 [Messaging] Participant email request received:', { 
      to, 
      participant_name, 
      email_type: email_type || 'custom',
      content_length: content?.length || 0
    });

    // Validate required fields
    if (!to || !participant_name || !subject || !content) {
      console.error('❌ [Messaging] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, participant_name, subject, content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    if (!to.includes('@') || !to.includes('.')) {
      console.error('❌ [Messaging] Invalid email format:', to);
      return new Response(
        JSON.stringify({ error: 'Invalid email address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start background email task
    EdgeRuntime.waitUntil(sendParticipantEmailInBackground({
      to,
      subject,
      content,
      participant_name,
      email_type,
    }));

    // Return immediate success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Participant email queued for sending',
        details: { 
          to, 
          participant_name, 
          email_type: email_type || 'custom',
          status: 'queued'
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('❌ [Messaging] Request handling error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process participant email request',
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