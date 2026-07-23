import { DefaultSession, DefaultUser } from 'next-auth';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            tenantId: string | null;
            role: string | null;
            email: string;
        } & DefaultSession['user'];
    }

    interface User extends DefaultUser {
        tenantId: string | null;
        role: string | null;
    }
}
