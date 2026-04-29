import { createServerClient } from "@/lib/supabase";
import Link from "next/link";

export const revalidate = 0;

export default async function EditionsPage() {
  const supabase = createServerClient();

  const { data: editions } = await supabase
    .from("newsletter_editions")
    .select(`
      id,
      subject_line,
      preview_text,
      approval_status,
      delivery_status,
      rewrite_count,
      created_at,
      newsletter_instances ( name, vertical )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending:  "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    return styles[status] ?? "bg-gray-100 text-gray-800";
  };

  const deliveryBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft:     "bg-gray-100 text-gray-600",
      scheduled: "bg-blue-100 text-blue-800",
      sent:      "bg-green-100 text-green-800",
      failed:    "bg-red-100 text-red-800",
    };
    return styles[status] ?? "bg-gray-100 text-gray-600";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Editions</h1>
        <p className="text-gray-500 text-sm mt-1">Review and approve newsletter editions before they are sent.</p>
      </div>

      {!editions?.length ? (
        <div className="text-center py-16 text-gray-400">No editions yet.</div>
      ) : (
        <div className="space-y-3">
          {editions.map((edition) => {
            const instance = edition.newsletter_instances as unknown as { name: string; vertical: string } | null;
            return (
              <Link
                key={edition.id}
                href={`/editions/${edition.id}`}
                className="block bg-white rounded-lg border border-gray-200 px-6 py-4 hover:border-gray-400 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">
                        {instance?.name ?? "Unknown instance"}
                      </span>
                      {(edition.rewrite_count ?? 0) > 0 && (
                        <span className="text-xs text-gray-400">· {edition.rewrite_count} rewrite{edition.rewrite_count !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <p className="font-medium text-gray-900 truncate">{edition.subject_line ?? "(No subject)"}</p>
                    <p className="text-sm text-gray-500 truncate mt-0.5">{edition.preview_text}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(edition.approval_status)}`}>
                      {edition.approval_status}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${deliveryBadge(edition.delivery_status ?? "draft")}`}>
                      {edition.delivery_status ?? "draft"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(edition.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
