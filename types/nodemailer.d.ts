declare module 'nodemailer' {
  interface TransportOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    pool?: boolean;
    maxConnections?: number;
    maxMessages?: number;
  }

  interface MailOptions {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }

  interface SentMessageInfo {
    messageId?: string;
  }

  interface Transporter {
    sendMail(options: MailOptions): Promise<SentMessageInfo>;
    close(): void | Promise<void>;
  }

  export function createTransport(options: TransportOptions): Transporter;
}
