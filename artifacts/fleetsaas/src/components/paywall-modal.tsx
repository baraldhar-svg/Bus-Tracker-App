import { Subscription } from "@workspace/api-client-react/src/generated/api.schemas";

export default function PaywallModal({ subscription }: { subscription: Subscription }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
        <h2 className="mb-2 text-2xl font-bold text-destructive text-center">TRIAL EXPIRED</h2>
        <p className="mb-6 text-center text-muted-foreground">
          Your 30-day free trial has expired. Please select a plan to resume services.
        </p>

        <div className="space-y-3 mb-6">
          <button className="w-full rounded-lg border border-border p-4 text-left hover:border-primary hover:bg-muted transition-colors">
            <div className="font-bold text-primary">Silver Plan</div>
            <div className="text-sm text-muted-foreground">NPR 500 / vehicle / month</div>
          </button>
          <button className="w-full rounded-lg border border-border p-4 text-left hover:border-primary hover:bg-muted transition-colors">
            <div className="font-bold text-primary">Gold Plan</div>
            <div className="text-sm text-muted-foreground">NPR 1000 / vehicle / month</div>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button className="rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700">eSewa</button>
          <button className="rounded-lg bg-purple-600 py-3 font-semibold text-white hover:bg-purple-700">Khalti</button>
        </div>
      </div>
    </div>
  );
}
