export default function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200 ${className}`}
      {...props}
    />
  );
}

export function SkeletonStatCard() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 w-24 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-16 rounded-lg bg-slate-200" />
    </div>
  );
}

export function SkeletonAppointmentItem() {
  return (
    <div className="card flex animate-pulse flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="h-3 w-48 rounded bg-slate-200" />
        <div className="h-3 w-28 rounded bg-slate-200" />
      </div>
      <div className="h-8 w-24 rounded-lg bg-slate-200" />
    </div>
  );
}

export function SkeletonDashboard({ statCount = 4, itemCount = 3 }) {
  return (
    <div className="space-y-8 animate-pulse" role="status" aria-label="Loading dashboard">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-slate-200" />
          <div className="h-4 w-64 rounded bg-slate-200" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-slate-200" />
      </div>

      {/* Stat Cards Grid Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: statCount }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Content List Skeleton */}
      <div className="space-y-4">
        <div className="h-5 w-48 rounded bg-slate-200" />
        <div className="space-y-3">
          {Array.from({ length: itemCount }).map((_, i) => (
            <SkeletonAppointmentItem key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
