import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Trigger.dev tasks ────────────────────────────────────────────────────
const mockTasksTrigger = vi.fn().mockResolvedValue({});
vi.mock("@trigger.dev/sdk/v3", () => ({
  schedules: {
    task: (config: { run: Function }) => ({ run: config.run }),
  },
  tasks: { trigger: mockTasksTrigger },
}));

// ── Mock Supabase ─────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── Mock croner ───────────────────────────────────────────────────────────────
const mockNextRun = vi.fn().mockReturnValue(new Date("2025-02-01T08:00:00Z"));
vi.mock("croner", () => ({
  Cron: class {
    constructor(_expr: string, _opts?: unknown) {}
    nextRun() { return mockNextRun(); }
  },
}));

describe("schedule-instances task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-key";
  });

  function setupSupabase(instances: unknown[]) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: instances }),
      update: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
    };
    // update chain returns object with eq
    chain.update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    mockFrom.mockReturnValue(chain);
    return chain;
  }

  it("triggers run-instance for each overdue active instance", async () => {
    setupSupabase([
      {
        id: "inst-1",
        next_run_at: "2025-01-01T00:00:00Z", // in the past
        cron_schedule: "0 8 * * *",
        timezone: "UTC",
      },
      {
        id: "inst-2",
        next_run_at: "2025-01-01T00:00:00Z",
        cron_schedule: "0 9 * * *",
        timezone: "Asia/Singapore",
      },
    ]);

    const { scheduleInstances } = await import("../../trigger/schedule-instances.js");
    await scheduleInstances.run();

    expect(mockTasksTrigger).toHaveBeenCalledTimes(2);
    expect(mockTasksTrigger).toHaveBeenCalledWith("run-instance", { instanceId: "inst-1" });
    expect(mockTasksTrigger).toHaveBeenCalledWith("run-instance", { instanceId: "inst-2" });
  });

  it("skips instances whose next_run_at is in the future", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString(); // tomorrow
    setupSupabase([
      {
        id: "inst-future",
        next_run_at: future,
        cron_schedule: "0 8 * * *",
        timezone: "UTC",
      },
    ]);

    const { scheduleInstances } = await import("../../trigger/schedule-instances.js");
    await scheduleInstances.run();

    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  it("skips instances with invalid cron_schedule", async () => {
    setupSupabase([
      {
        id: "inst-bad-cron",
        next_run_at: "2025-01-01T00:00:00Z",
        cron_schedule: "not-a-cron",
        timezone: "UTC",
      },
    ]);

    // croner throws on invalid expression
    mockNextRun.mockImplementationOnce(() => {
      throw new Error("Invalid cron");
    });
    vi.mock("croner", () => ({
      Cron: class {
        constructor(expr: string) {
          if (expr === "not-a-cron") throw new Error("Invalid cron");
        }
        nextRun() { return new Date(); }
      },
    }));

    const { scheduleInstances } = await import("../../trigger/schedule-instances.js");
    await scheduleInstances.run();

    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  it("does nothing when no active instances exist", async () => {
    setupSupabase([]);

    const { scheduleInstances } = await import("../../trigger/schedule-instances.js");
    await scheduleInstances.run();

    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });
});
