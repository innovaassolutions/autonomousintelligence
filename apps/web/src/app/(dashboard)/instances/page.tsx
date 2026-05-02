import Link from "next/link";
import { createServerClient } from "@/lib/supabase";

export const revalidate = 0;

export default async function InstancesPage() {
  const supabase = createServerClient();

  const { data: instances } = await supabase
    .from("newsletter_instances")
    .select("id, name, vertical, slug, is_active, cron_schedule, timezone, next_run_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Instances</h1>
          <p className="text-gray-500 text-sm mt-1">Configured newsletter verticals.</p>
        </div>
        <Link
          href="/instances/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Add instance
        </Link>
      </div>

      {!instances?.length ? (
        <div className="text-center py-16 text-gray-400">No instances configured.</div>
      ) : (
        <div className="space-y-3">
          {instances.map((instance) => (
            <div
              key={instance.id}
              className="bg-white rounded-lg border border-gray-200 px-6 py-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{instance.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      instance.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {instance.is_active ? "active" : "paused"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {instance.vertical} · {instance.cron_schedule} · {instance.timezone}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-xs text-gray-400">
                    {instance.next_run_at
                      ? <>Next run: {new Date(instance.next_run_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</>
                      : "Not scheduled"}
                  </div>
                  <Link
                    href={`/instances/${instance.id}/edit`}
                    className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
