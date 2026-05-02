"use client";

import { useState } from "react";

interface BeehiivAccount {
  id: string;
  name: string;
  created_at: string;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 ${props.className ?? ""}`}
    />
  );
}

function AccountRow({
  account,
  onUpdated,
  onDeleted,
}: {
  account: BeehiivAccount;
  onUpdated: (updated: BeehiivAccount) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/beehiiv-accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, api_key: apiKey }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || json.error) { setError(json.error ?? "Failed"); return; }
    onUpdated({ ...account, name });
    setEditing(false);
    setApiKey("");
  }

  async function remove() {
    if (!confirm(`Delete "${account.name}"? Any instances linked to it will lose their Beehiiv connection.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/beehiiv-accounts/${account.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok || json.error) { setError(json.error ?? "Failed"); setDeleting(false); return; }
    onDeleted(account.id);
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Account name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Innovaas" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              New API key <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="BH_live_..."
              autoComplete="off"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setName(account.name); setApiKey(""); setError(null); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-3.5">
      <div>
        <p className="text-sm font-medium text-gray-900">{account.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Added {new Date(account.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {" · "}API key stored in Vault
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="text-sm text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}

export function BeehiivAccountsManager({ initialAccounts }: { initialAccounts: BeehiivAccount[] }) {
  const [accounts, setAccounts] = useState<BeehiivAccount[]>(initialAccounts);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addAccount() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/beehiiv-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, api_key: newApiKey }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || json.error) { setError(json.error ?? "Failed"); return; }
    setAccounts((prev) => [...prev, { id: json.id, name: newName, created_at: new Date().toISOString() }]);
    setAdding(false);
    setNewName("");
    setNewApiKey("");
  }

  return (
    <div className="space-y-3">
      {accounts.length === 0 && !adding && (
        <p className="text-sm text-gray-400 py-4">No Beehiiv accounts configured yet.</p>
      )}

      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          onUpdated={(updated) => setAccounts((prev) => prev.map((a) => a.id === updated.id ? updated : a))}
          onDeleted={(id) => setAccounts((prev) => prev.filter((a) => a.id !== id))}
        />
      ))}

      {adding ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Add Beehiiv account</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Account name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Innovaas"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">API key</label>
              <Input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="BH_live_..."
                autoComplete="off"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={addAccount}
              disabled={saving || !newName.trim() || !newApiKey.trim()}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save account"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewName(""); setNewApiKey(""); setError(null); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Add account
        </button>
      )}
    </div>
  );
}
