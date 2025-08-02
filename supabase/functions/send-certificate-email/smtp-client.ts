/**
 * SMTP Client for sending emails via smtp.titan.email
 * Handles proper SMTP protocol communication with error checking
 */

interface SmtpConfig {
  hostname: string;
  port: number;
  username: string;
  password: string;
}

interface EmailData {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export class SmtpClient {
  private config: SmtpConfig;
  private conn: Deno.TlsConn | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.conn = await Deno.connectTls({
        hostname: this.config.hostname,
        port: this.config.port,
      });
      
      // Read server greeting
      const greeting = await this.readResponse();
      if (!greeting.startsWith('220')) {
        throw new Error(`SMTP connection failed: ${greeting}`);
      }
      console.log('SMTP connected:', greeting);
    } catch (error) {
      throw new Error(`Failed to connect to SMTP server: ${error.message}`);
    }
  }

  async sendEmail(emailData: EmailData): Promise<void> {
    if (!this.conn) {
      throw new Error('SMTP connection not established');
    }

    try {
      // EHLO command
      await this.sendCommand('EHLO', this.config.hostname);
      
      // AUTH LOGIN
      await this.sendCommand('AUTH LOGIN');
      
      // Send username (base64 encoded)
      const usernameResponse = await this.sendCommand(btoa(this.config.username));
      if (!usernameResponse.startsWith('334')) {
        throw new Error(`AUTH username failed: ${usernameResponse}`);
      }
      
      // Send password (base64 encoded)
      const passwordResponse = await this.sendCommand(btoa(this.config.password));
      if (!passwordResponse.startsWith('235')) {
        throw new Error(`AUTH password failed: ${passwordResponse}`);
      }
      
      // MAIL FROM - extract email from "Name <email>" format
      const fromEmail = this.extractEmailAddress(emailData.from);
      const mailFromResponse = await this.sendCommand(`MAIL FROM:<${fromEmail}>`);
      if (!mailFromResponse.startsWith('250')) {
        throw new Error(`MAIL FROM failed: ${mailFromResponse}. Check if email ${fromEmail} is verified on smtp.titan.email`);
      }
      
      // RCPT TO
      const rcptToResponse = await this.sendCommand(`RCPT TO:<${emailData.to}>`);
      if (!rcptToResponse.startsWith('250')) {
        throw new Error(`RCPT TO failed: ${rcptToResponse}`);
      }
      
      // DATA command
      const dataResponse = await this.sendCommand('DATA');
      if (!dataResponse.startsWith('354')) {
        throw new Error(`DATA command failed: ${dataResponse}`);
      }
      
      // Send email content
      const emailContent = this.formatEmailMessage(emailData);
      await this.conn.write(this.encoder.encode(emailContent + '\r\n.\r\n'));
      
      const sendResponse = await this.readResponse();
      if (!sendResponse.startsWith('250')) {
        throw new Error(`Email sending failed: ${sendResponse}`);
      }
      
      console.log('Email sent successfully:', sendResponse);
      
    } catch (error) {
      throw new Error(`SMTP send failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      try {
        await this.sendCommand('QUIT');
        this.conn.close();
        this.conn = null;
      } catch (error) {
        console.warn('Error during SMTP disconnect:', error.message);
        this.conn?.close();
        this.conn = null;
      }
    }
  }

  private async sendCommand(command: string, parameter?: string): Promise<string> {
    if (!this.conn) {
      throw new Error('SMTP connection not established');
    }

    const fullCommand = parameter ? `${command} ${parameter}` : command;
    console.log('SMTP Command:', fullCommand);
    
    await this.conn.write(this.encoder.encode(fullCommand + '\r\n'));
    const response = await this.readResponse();
    
    console.log('SMTP Response:', response);
    return response;
  }

  private async readResponse(): Promise<string> {
    if (!this.conn) {
      throw new Error('SMTP connection not established');
    }

    let response = '';
    const buffer = new Uint8Array(4096);

    while (true) {
      const n = await this.conn.read(buffer);
      if (n === null || n === 0) break;

      const chunk = this.decoder.decode(buffer.subarray(0, n));
      response += chunk;

      // Check if we have a complete SMTP response
      const lines = response.split('\r\n');
      if (lines.length > 1) {
        const lastCompleteLine = lines[lines.length - 2];
        // SMTP response is complete if the last line doesn't have a hyphen after the code
        if (lastCompleteLine && lastCompleteLine.length >= 4) {
          const code = lastCompleteLine.substring(0, 3);
          const separator = lastCompleteLine.charAt(3);
          if (/^\d{3}$/.test(code) && separator === ' ') {
            break;
          }
        }
      }
    }

    return response.trim();
  }

  private formatEmailMessage(emailData: EmailData): string {
    return [
      `From: ${emailData.from}`,
      `To: ${emailData.to}`,
      `Subject: ${emailData.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      emailData.html
    ].join('\r\n');
  }

  private extractEmailAddress(fromField: string): string {
    // Extract email from "Name <email>" format or return as-is if already just email
    const match = fromField.match(/<(.+)>/);
    return match ? match[1] : fromField;
  }
}