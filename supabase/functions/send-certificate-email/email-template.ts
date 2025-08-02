/**
 * Email template generator for certificate emails
 */

interface CertificateEmailData {
  participant_name: string;
  message: string;
  certificate_number: string;
  certificate_url: string;
}

export function generateCertificateEmailTemplate(data: CertificateEmailData): string {
  const { participant_name, message, certificate_number, certificate_url } = data;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Certificate from Metascholar Institute</title>
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
            background: #2563eb; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0; 
          }
          .content { 
            background: #f8fafc; 
            padding: 30px; 
            border-radius: 0 0 8px 8px; 
          }
          .certificate-preview { 
            text-align: center; 
            margin: 20px 0; 
          }
          .certificate-preview img { 
            max-width: 100%; 
            height: auto; 
            border: 2px solid #e2e8f0; 
            border-radius: 8px; 
          }
          .button { 
            display: inline-block; 
            background: #2563eb; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 10px 0; 
          }
          .footer { 
            text-align: center; 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 1px solid #e2e8f0; 
            color: #64748b; 
            font-size: 14px; 
          }
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
            <p style="text-align: center; padding: 20px; background: #f1f5f9; border-radius: 8px; margin: 20px 0;">
              <strong>📄 Your certificate is attached to this email as a PDF file</strong><br>
              <span style="color: #64748b; font-size: 14px;">Please check your email attachments to download your certificate</span>
            </p>
          </div>
          
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
}