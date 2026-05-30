import Link from 'next/link';

const agencyTiers = [
  {
    name: 'Starter',
    price: '$99/mo',
    description: '25 audits per month, branded reports, and proposal generation.',
  },
  {
    name: 'Professional',
    price: '$299/mo',
    description: '100 audits per month, client portal access, and priority support.',
  },
  {
    name: 'Agency',
    price: '$599/mo',
    description: 'Unlimited audits, multi-user seats, and dedicated onboarding.',
  },
];

export default function AgencyTiers() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {agencyTiers.map((tier) => (
        <div
          key={tier.name}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white"
        >
          <h3 className="text-xl font-bold">{tier.name}</h3>
          <p className="mt-2 text-3xl font-black text-indigo-300">{tier.price}</p>
          <p className="mt-4 text-sm text-slate-300">{tier.description}</p>
          <Link
            href="/register"
            className="mt-6 inline-flex rounded-lg bg-white px-4 py-2 font-semibold text-slate-900"
          >
            Create account
          </Link>
        </div>
      ))}
    </div>
  );
}
