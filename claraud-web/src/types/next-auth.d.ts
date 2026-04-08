import NextAuth, { DefaultSession, DefaultUser } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            role: string
            tenantId: string
        } & DefaultSession["user"]
    }

    interface User extends DefaultUser {
        role: string
        tenantId?: string | null
    }

    interface JWT {
        id: string
        role: string
        tenantId: string
    }
}
