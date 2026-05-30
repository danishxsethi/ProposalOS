'use client';

export default function ManageSubscriptionButton() {
  const handleManageSubscription = async () => {
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  return (
    <button
      onClick={handleManageSubscription}
      className="bg-indigo-600 px-4 py-2 rounded font-bold text-sm text-white hover:bg-indigo-500"
      type="button"
    >
      Manage Subscription
    </button>
  );
}
