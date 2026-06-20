import { useListAnnouncements, useGetTripTimeline, useListCalendarEvents } from "@workspace/api-client-react";

function todayAdStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function tomorrowAdStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ParentPortal() {
  const { data: announcements } = useListAnnouncements();
  const { data: timeline } = useGetTripTimeline();

  const thisMonth = todayAdStr().slice(0, 7);
  const { data: calEvents } = useListCalendarEvents({ month: thisMonth });

  const todayStr = todayAdStr();
  const tmrStr = tomorrowAdStr();

  const upcomingEvents = (calEvents ?? []).filter(
    (e) => e.eventDate === todayStr || e.eventDate === tmrStr
  );

  return (
    <div className="mx-auto w-full max-w-[480px] bg-card p-4 shadow-md sm:my-8 sm:rounded-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary">FleetSaaS Parent</h1>
      </div>

      <div className="mb-6 rounded-lg bg-muted p-4 text-center">
        <p className="text-sm font-medium">Please upload standard uniform photos only! (कृपया युनिफर्म सहितको फोटोमात्र मान्य हुने छ !)</p>
      </div>

      {/* Upcoming Calendar Events urgent banner */}
      {upcomingEvents.length > 0 && (
        <div className="mb-4 space-y-2">
          {upcomingEvents.map((ev) => {
            const isToday = ev.eventDate === todayStr;
            const isHoliday = ev.type === "holiday";
            return (
              <div key={ev.id} className={`flex items-start gap-3 rounded-xl border p-3 ${isHoliday ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"}`}>
                <span className="text-lg">{isHoliday ? "🎉" : "📅"}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold uppercase tracking-wide ${isHoliday ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {isHoliday ? "Holiday" : "Event"} {isToday ? "Today" : "Tomorrow"}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{ev.title}</p>
                  {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
