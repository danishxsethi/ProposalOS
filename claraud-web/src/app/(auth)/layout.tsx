import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: { template: "%s | Claraud", default: "Sign In | Claraud" },
    description: "Sign in to your Claraud account to access your dashboard.",
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    if (session) {
        redirect("/dashboard");
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40">
            <div className="w-full max-w-md">{children}</div>
        </div>
    );
}
