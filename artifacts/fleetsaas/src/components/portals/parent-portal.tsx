import { useListAnnouncements, useGetTripTimeline } from "@workspace/api-client-react";

export default function ParentPortal() {
  const { data: announcements } = useListAnnouncements();
  const { data: timeline } = useGetTripTimeline(1); // placeholder tripId

  return (
    <div className="mx-auto w-full max-w-[480px] bg-card p-4 shadow-md sm:my-8 sm:rounded-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary">FleetSaaS Parent</h1>
      </div>

      <div className="mb-6 rounded-lg bg-muted p-4 text-center">
        <p className="text-sm font-medium">Please upload standard uniform photos only! (कृपया युनिफर्म सहितको फोटोमात्र मान्य हुने छ !)</p>
      </div>

      {announcements?.length ? (
        <div className="mb-6 space-y-2">
          <h2 className="font-semibold text-primary">Notices</h2>
          {announcements.map((a) => (
            <div key={a.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
              <p className="text-sm">{a.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-6">
        <h2 className="mb-2 font-semibold text-primary">Tracking Timeline</h2>
        {timeline ? (
          <div className="space-y-3">
            {timeline.map((event) => (
              <div key={event.id} className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${event.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div>
                  <p className="text-sm font-medium">{event.description}</p>
                  <p className="text-xs text-muted-foreground">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading timeline...</p>
        )}
      </div>
    </div>
  );
}
