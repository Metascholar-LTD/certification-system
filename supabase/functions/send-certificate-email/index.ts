import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "./smtp-client.ts";

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

// Email sending function using SmtpClient
async function sendCertificateEmail(emailData: EmailRequest): Promise<void> {
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  if (!smtpPassword) {
    console.error('❌ SMTP_PASSWORD not configured in environment variables');
    throw new Error('SMTP_PASSWORD not configured');
  }

  console.log(`📧 Sending certificate to: ${emailData.to}`);
  console.log(`📄 Certificate data length: ${emailData.certificate_url.length}`);

  // Extract clean base64 data from data URL
  if (!emailData.certificate_url.startsWith('data:application/pdf;base64,')) {
    throw new Error('Invalid certificate URL format');
  }

  const base64Data = emailData.certificate_url.split(',')[1];
  console.log(`📄 Base64 data length: ${base64Data.length}`);

  if (base64Data.length < 1000) {
    throw new Error('Certificate data appears to be corrupted or too small');
  }

  // Verify PDF header
  try {
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const pdfHeader = new TextDecoder().decode(binaryData.slice(0, 4));
    if (pdfHeader !== '%PDF') {
      throw new Error('Invalid PDF data - missing PDF header');
    }
    console.log('✅ PDF validation passed');
  } catch (error) {
    throw new Error(`Invalid base64 PDF data: ${error.message}`);
  }

  // Generate filename
  const safeName = emailData.participant_name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${safeName}_Certificate_${timestamp}.pdf`;

  // Create HTML content
  const htmlContent = `
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
        <p>Dear <strong>${emailData.participant_name}</strong>,</p>
        
        <p>${emailData.message || 'Congratulations on successfully completing the course! Your dedication and hard work have paid off.'}</p>
        
        <div class="certificate-info">
            <p><strong>🏆 Your certificate is now ready!</strong></p>
            ${emailData.certificate_number ? `<p><strong>Certificate Number:</strong> ${emailData.certificate_number}</p>` : ''}
            <p><strong>📎 Your certificate is attached to this email as a PDF file.</strong></p>
            <p>Look for the PDF attachment to download and save your certificate.</p>
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
</html>`;

  // Use SmtpClient for reliable email sending
  const smtpClient = new SmtpClient({
    hostname: 'smtp.titan.email',
    port: 465,
    username: 'support@academicdigital.space',
    password: smtpPassword,
  });

  try {
    console.log('🔌 Connecting to SMTP server via SmtpClient...');
    await smtpClient.connect();
    
    console.log('📤 Sending email with PDF attachment...');
    await smtpClient.sendEmail({
      from: 'Metascholar Institute <support@academicdigital.space>',
      to: emailData.to,
      subject: emailData.subject,
      html: htmlContent,
      attachments: [{
        filename: filename,
        content: base64Data,
        contentType: 'application/pdf',
        encoding: 'base64'
      }]
    });
    
    console.log('✅ Email sent successfully via SmtpClient');
  } finally {
    await smtpClient.disconnect();
  }
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

    // Send email in background with proper error handling
    sendCertificateEmail(emailData).then(() => {
      console.log('✅ Background email sending completed successfully');
    }).catch(error => {
      console.error('❌ Background email sending failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        to: emailData.to,
        participant_name: emailData.participant_name
      });
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
    console.error('❌ Request processing error:', error);
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