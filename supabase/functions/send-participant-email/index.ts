import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

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

// Background email sending using Resend for participant messaging
async function sendParticipantEmailInBackground(emailData: {
  to: string;
  subject: string;
  content: string;
  participant_name: string;
  email_type?: string;
}): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('❌ [Messaging] RESEND_API_KEY not configured in environment variables');
    throw new Error('RESEND_API_KEY not configured');
  }

  console.log(`📧 [Messaging] Starting email send to: ${emailData.to}`);
  console.log(`👤 [Messaging] Participant: ${emailData.participant_name}`);
  console.log(`📝 [Messaging] Email type: ${emailData.email_type || 'custom'}`);

  const htmlContent = generateParticipantEmailTemplate({
    participant_name: emailData.participant_name,
    content: emailData.content,
    email_type: emailData.email_type,
  });

  console.log(`📄 [Messaging] Generated email content: ${htmlContent.length} characters`);

  // Use Resend for reliable email delivery
  const resend = new Resend(resendApiKey);
  
  try {
    console.log('📤 [Messaging] Sending email via Resend...');
    const emailResponse = await resend.emails.send({
      from: 'Metascholar Institute <onboarding@resend.dev>',
      to: [emailData.to],
      subject: emailData.subject,
      html: htmlContent,
    });

    if (emailResponse.error) {
      throw new Error(`Resend API error: ${emailResponse.error.message}`);
    }

    console.log('✅ [Messaging] Email sent successfully via Resend:', emailResponse.data?.id);
  } catch (error) {
    console.error('❌ [Messaging] Resend Email Error:', error);
    throw error;
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

    // Start background email task using EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(sendParticipantEmailInBackground({
      to,
      subject,
      content,
      participant_name,
      email_type,
    }).then(() => {
      console.log('✅ [Messaging] Background email sending completed successfully');
    }).catch(error => {
      console.error('❌ [Messaging] Background email sending failed:', error);
      console.error('❌ [Messaging] Error details:', {
        message: error.message,
        stack: error.stack,
        to: to,
        participant_name: participant_name
      });
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