import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState, mockSection } from "../fixtures.js";

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// Mock the email template renderer
vi.mock("../../emails/newsletter-template.js", () => ({
  renderNewsletterHTML: vi.fn().mockResolvedValue("<html><body>Test newsletter</body></html>"),
}));

describe("assemblyAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-key";

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "edition-123" } }),
    };
    mockInsert.mockReturnValue(selectChain);
    mockUpdate.mockReturnValue({ eq: mockEq.mockResolvedValue({}) });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });
  });

  it("renders HTML, inserts edition, updates pipeline_run", async () => {
    const { assemblyAgent } = await import("../../agents/assembly-agent.js");
    const result = await assemblyAgent({
      ...mockBaseState,
      sections: [mockSection],
      subjectLine: "This Week in Tech",
      previewText: "Don't miss this",
    });

    expect(result.htmlContent).toBe("<html><body>Test newsletter</body></html>");
    expect(result.status).toBe("assembling");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subject_line: "This Week in Tech",
        approval_status: "pending",
        delivery_status: "draft",
      })
    );
  });
});
