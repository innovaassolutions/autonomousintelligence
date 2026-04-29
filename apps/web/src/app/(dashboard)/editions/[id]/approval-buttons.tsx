"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApprovalButtons({ editionId }: { editionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: "approved" | "rejected") {
    setLoading(decision === "approved" ? "approve" : "reject");
    setError(null);

    try {
      const res = await fetch(`/api/editions/${editionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          approvedBy: "admin",
          rejectionNote: decision === "rejected" ? rejectionNote : undefined,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <p className="text-sm font-medium text-yellow-800 mb-3">This edition is awaiting your approval.</p>

      {error && (
        <p className="text-sm text-red-600 mb-3">{error}</p>
      )}

      {showRejectForm ? (
        <div className="space-y-3">
          <textarea
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            placeholder="Reason for rejection (optional)"
            rows={3}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => submit("rejected")}
              disabled={!!loading}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {loading === "reject" ? "Rejecting…" : "Confirm rejection"}
            </button>
            <button
              onClick={() => setShowRejectForm(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => submit("approved")}
            disabled={!!loading}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading === "approve" ? "Approving…" : "Approve & send"}
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={!!loading}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
