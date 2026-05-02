"use client";

import { useState } from "react";

export function RunNowButton({ instanceId }: { instanceId: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");

  async function handleClick() {
    setState("running");
    try {
      const res = await fetch(`/api/instances/${instanceId}/run`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) {
        setState("error");
        setTimeout(() => setState("idle"), 3000);
      } else {
        setState("done");
        setTimeout(() => setState("idle"), 3000);
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "running"}
      className="text-sm text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40"
    >
      {state === "idle" && "Run now"}
      {state === "running" && "Starting…"}
      {state === "done" && "Started ✓"}
      {state === "error" && "Failed ✗"}
    </button>
  );
}
