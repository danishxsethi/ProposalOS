import { notFound } from 'next/navigation';

export const dynamicParams = false;

export async function generateStaticParams() {
  return [];
}

export default function VerticalLandingPage() {
  notFound();
}
