import { Metadata } from 'next';

export const metadata: Metadata = {
    title: "For Agencies | Claraud",
};

export default function AgenciesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
