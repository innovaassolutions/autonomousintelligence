"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NewsletterInstance {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  description: string | null;
  target_audience: string | null;
  cron_schedule: string;
  timezone: string;
  is_active: boolean;
  voice_prompt: string;
  newsletter_name: string;
  editorial_focus: string | null;
  max_rewrite_loops: number;
  beehiiv_account_id: string | null;
  beehiiv_pub_id: string | null;
  send_hour: number;
  subject_template: string | null;
  require_approval: boolean;
  approver_email: string | null;
  linked_product: string | null;
}

interface BeehiivAccount {
  id: string;
  name: string;
}

const TABS = [
  "Basic Info",
  "Schedule",
  "Voice & Editorial",
  "Delivery",
  "Approval",
] as const;
type Tab = (typeof TABS)[number];

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-50 ${props.className ?? ""}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 ${props.className ?? ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 ${props.className ?? ""}`}
    />
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="mb-5">{children}</div>;
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1 text-sm text-gray-600 border border-dashed border-gray-300 rounded-md px-3 py-1.5 hover:border-gray-400 hover:text-gray-800 transition-colors"
    >
      <span className="text-base leading-none">+</span>
      {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-lg leading-none px-1"
      aria-label="Remove"
    >
      ×
    </button>
  );
}

export function InstanceForm({
  defaultValues,
  instanceId,
  beehiivAccounts = [],
}: {
  defaultValues?: Partial<NewsletterInstance>;
  instanceId?: string;
  beehiivAccounts?: BeehiivAccount[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Basic Info");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic Info
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [slug, setSlug] = useState(defaultValues?.slug ?? "");
  const [vertical, setVertical] = useState(defaultValues?.vertical ?? "");
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [targetAudience, setTargetAudience] = useState(defaultValues?.target_audience ?? "");
  const [isActive, setIsActive] = useState(defaultValues?.is_active ?? true);

  // Schedule
  const [cronSchedule, setCronSchedule] = useState(defaultValues?.cron_schedule ?? "");
  const [timezone, setTimezone] = useState(defaultValues?.timezone ?? "Asia/Singapore");
  const [sendHour, setSendHour] = useState(defaultValues?.send_hour ?? 7);

  // Voice & Editorial
  const [newsletterName, setNewsletterName] = useState(defaultValues?.newsletter_name ?? "");
  const [voicePrompt, setVoicePrompt] = useState(defaultValues?.voice_prompt ?? "");
  const [editorialFocus, setEditorialFocus] = useState(defaultValues?.editorial_focus ?? "");
  const [maxRewriteLoops, setMaxRewriteLoops] = useState(defaultValues?.max_rewrite_loops ?? 2);

  // Delivery
  const [beehiivAccountId, setBeehiivAccountId] = useState(defaultValues?.beehiiv_account_id ?? "");
  const [beehiivPubId, setBeehiivPubId] = useState(defaultValues?.beehiiv_pub_id ?? "");
  const [subjectTemplate, setSubjectTemplate] = useState(defaultValues?.subject_template ?? "");

  // Approval
  const [requireApproval, setRequireApproval] = useState(defaultValues?.require_approval ?? true);
  const [approverEmail, setApproverEmail] = useState(defaultValues?.approver_email ?? "");
  const [linkedProduct, setLinkedProduct] = useState(defaultValues?.linked_product ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      slug,
      vertical,
      description: description || null,
      target_audience: targetAudience || null,
      is_active: isActive,
      cron_schedule: cronSchedule,
      timezone,
      send_hour: sendHour,
      newsletter_name: newsletterName,
      voice_prompt: voicePrompt,
      editorial_focus: editorialFocus || null,
      max_rewrite_loops: maxRewriteLoops,
      beehiiv_account_id: beehiivAccountId || null,
      beehiiv_pub_id: beehiivPubId || null,
      subject_template: subjectTemplate || null,
      require_approval: requireApproval,
      approver_email: approverEmail || null,
      linked_product: linkedProduct || null,
    };

    try {
      const url = instanceId ? `/api/instances/${instanceId}` : "/api/instances";
      const method = instanceId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? "Request failed");
        setSubmitting(false);
        return;
      }
      router.push("/instances");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Basic Info */}
        {activeTab === "Basic Info" && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Basic Info</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldGroup>
                <Label required>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Manufacturing Ops Weekly"
                  required
                />
              </FieldGroup>
              <FieldGroup>
                <Label required>Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="manufacturing-ops"
                  required
                />
              </FieldGroup>
              <FieldGroup>
                <Label required>Vertical</Label>
                <Input
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                  placeholder="manufacturing"
                  required
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Active</Label>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Enable this instance
                  </label>
                </div>
              </FieldGroup>
            </div>
            <FieldGroup>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Brief description of this newsletter vertical"
              />
            </FieldGroup>
            <FieldGroup>
              <Label>Target Audience</Label>
              <Textarea
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                rows={3}
                placeholder="Used in Claude prompts to describe the intended reader"
              />
            </FieldGroup>
          </div>
        )}

        {/* Schedule */}
        {activeTab === "Schedule" && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Schedule</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldGroup>
                <Label required>Cron Schedule</Label>
                <Input
                  value={cronSchedule}
                  onChange={(e) => setCronSchedule(e.target.value)}
                  placeholder="0 7 * * 1"
                  required
                />
                <p className="mt-1 text-xs text-gray-400">Standard cron expression (5 fields)</p>
              </FieldGroup>
              <FieldGroup>
                <Label>Timezone</Label>
                <Input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Asia/Singapore"
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Send Hour (0–23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={sendHour}
                  onChange={(e) => setSendHour(Number(e.target.value))}
                />
              </FieldGroup>
            </div>
          </div>
        )}

        {/* Voice & Editorial */}
        {activeTab === "Voice & Editorial" && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Voice &amp; Editorial</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldGroup>
                <Label required>Newsletter Name</Label>
                <Input
                  value={newsletterName}
                  onChange={(e) => setNewsletterName(e.target.value)}
                  placeholder="Manufacturing Ops Weekly"
                  required
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Max Rewrite Loops</Label>
                <Input
                  type="number"
                  min={0}
                  value={maxRewriteLoops}
                  onChange={(e) => setMaxRewriteLoops(Number(e.target.value))}
                />
              </FieldGroup>
            </div>
            <FieldGroup>
              <Label required>Voice Prompt</Label>
              <Textarea
                value={voicePrompt}
                onChange={(e) => setVoicePrompt(e.target.value)}
                rows={10}
                required
                placeholder="Describe the newsletter's voice, tone, and style. Claude uses this when writing every section."
              />
            </FieldGroup>
            <FieldGroup>
              <Label>Editorial Focus</Label>
              <Textarea
                value={editorialFocus}
                onChange={(e) => setEditorialFocus(e.target.value)}
                rows={3}
                placeholder="Optional high-level editorial guidance, e.g. 'Emphasise regulatory and automation topics. Avoid vendor marketing pieces.'"
              />
              <p className="mt-1 text-xs text-gray-400">
                The research agent autonomously discovers and selects topics each run. Use this field to steer emphasis, not to prescribe specific sources or sections.
              </p>
            </FieldGroup>
          </div>
        )}

        {/* Delivery */}
        {activeTab === "Delivery" && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Delivery (Beehiiv)</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldGroup>
                <Label required>Beehiiv Account</Label>
                <Select
                  value={beehiivAccountId}
                  onChange={(e) => setBeehiivAccountId(e.target.value)}
                  className="w-full"
                >
                  <option value="">— Select account —</option>
                  {beehiivAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
                {beehiivAccounts.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    No accounts yet —{" "}
                    <a href="/settings/beehiiv" className="underline">add one in Settings</a>.
                  </p>
                )}
              </FieldGroup>
              <FieldGroup>
                <Label>Publication ID</Label>
                <Input
                  value={beehiivPubId}
                  onChange={(e) => setBeehiivPubId(e.target.value)}
                  placeholder="pub_xxxxxxxx-..."
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Subject Template</Label>
                <Input
                  value={subjectTemplate}
                  onChange={(e) => setSubjectTemplate(e.target.value)}
                  placeholder="Optional subject line template"
                />
              </FieldGroup>
            </div>
          </div>
        )}

        {/* Approval */}
        {activeTab === "Approval" && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Approval</h2>
            <FieldGroup>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="require_approval"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
                <label htmlFor="require_approval" className="text-sm font-medium text-gray-700">
                  Require approval before sending
                </label>
              </div>
            </FieldGroup>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldGroup>
                <Label>Approver Email</Label>
                <Input
                  type="email"
                  value={approverEmail}
                  onChange={(e) => setApproverEmail(e.target.value)}
                  placeholder="approver@example.com"
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Linked Product</Label>
                <Input
                  value={linkedProduct}
                  onChange={(e) => setLinkedProduct(e.target.value)}
                  placeholder="Optional product identifier"
                />
              </FieldGroup>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/instances")}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Saving..." : instanceId ? "Save changes" : "Create instance"}
        </button>
      </div>
    </form>
  );
}
