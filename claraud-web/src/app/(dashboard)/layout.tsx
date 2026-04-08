import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: { template: "%s | Claraud Dashboard", default: "Dashboard | Claraud" },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    return (
        <div className="flex h-screen w-full overflow-hidden bg-bg-primary">
            <DashboardSidebar user={session.user} />
            <div className="flex flex-1 flex-col overflow-hidden">
                <DashboardHeader user={session.user} />
                <main id="main-content" className="flex-1 overflow-auto p-6">{children}</main>
            </div>
        </div>
    );
}
