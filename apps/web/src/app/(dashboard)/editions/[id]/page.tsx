import { createServerClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { ApprovalButtons } from "./approval-buttons";

export const revalidate = 0;

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: edition } = await supabase
    .from("newsletter_editions")
    .select(`
      *,
      newsletter_instances ( name, vertical, target_audience )
    `)
    .eq("id", id)
    .single();

  if (!edition) notFound();

  const instance = edition.newsletter_instances as {
    name: string;
    vertical: string;
    target_audience: string;
  } | null;

  const sections = edition.sections as Array<{
    name: string;
    headline: string;
    body: string;
    key_takeaway: string;
    sources: Array<{ title: string; url: string }>;
  }>;

  const isPending = edition.approval_status === "pending";

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <a href="/editions" className="hover:text-gray-600">Editions</a>
          <span>/</span>
          <span>{instance?.name}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{edition.subject_line}</h1>
        <p className="text-gray-500 mt-1">{edition.preview_text}</p>

        <div className="flex items-center gap-3 mt-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            edition.approval_status === "pending" ? "bg-yellow-100 text-yellow-800" :
            edition.approval_status === "approved" ? "bg-green-100 text-green-800" :
            "bg-red-100 text-red-800"
          }`}>
            {edition.approval_status}
          </span>
          {(edition.rewrite_count ?? 0) > 0 && (
            <span className="text-xs text-gray-400">{edition.rewrite_count} editorial rewrite{edition.rewrite_count !== 1 ? "s" : ""}</span>
          )}
          {edition.rejection_note && (
            <span className="text-xs text-red-500">Rejected: {edition.rejection_note}</span>
          )}
        </div>
      </div>

      {/* Approval actions */}
      {isPending && <ApprovalButtons editionId={id} />}

      {/* Sections */}
      <div className="space-y-8 mt-8">
        {sections.map((section, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{section.name}</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.headline}</h2>
            <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap mb-4">
              {section.body}
            </div>
            <div className="bg-gray-50 border-l-4 border-gray-900 px-4 py-2 text-sm text-gray-700 mb-4">
              <strong>Key takeaway:</strong> {section.key_takeaway}
            </div>
            {section.sources?.length > 0 && (
              <div className="text-xs text-gray-400">
                Sources:{" "}
                {section.sources.map((s, j) => (
                  <span key={j}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-gray-600">
                      {s.title}
                    </a>
                    {j < section.sources.length - 1 ? " · " : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* HTML preview */}
      {edition.html_content && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Rendered HTML preview</h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <iframe
              srcDoc={edition.html_content}
              className="w-full h-[600px]"
              title="Newsletter preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
