import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  listRegistrations: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@rr/db", () => ({ getDb: () => "db" }));
vi.mock("@rr/db/admin", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listRegistrations: mocks.listRegistrations,
}));

const row = {
  reference: "RR-AAAAAAA1",
  race: "5k",
  firstName: "=Juana",
  lastName: "Dela Cruz",
  email: "j•••@example.com",
  mobile: "•••01",
  shirtSize: "M",
  status: "paid",
  amountCentavos: 80_000,
  paymentMethod: "gcash",
  paidAt: new Date("2026-10-01T02:00:00Z"),
  confirmationSentAt: null,
  createdAt: new Date("2026-10-01T01:55:00Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSession.mockResolvedValue({ userId: "u1", name: "Demo", role: "viewer" });
  mocks.listRegistrations.mockResolvedValue({ rows: [row], total: 1 });
});

describe("GET /registrations/export", () => {
  it("checks the login itself and reads nothing when signed out", async () => {
    mocks.requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(GET(new Request("http://admin.test/registrations/export"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.listRegistrations).not.toHaveBeenCalled();
  });

  it("is never cached, and downloads as a CSV", async () => {
    const response = await GET(new Request("http://admin.test/registrations/export"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("queries as the session's role, with the page's filters but every page", async () => {
    mocks.requireSession.mockResolvedValue({ userId: "u2", name: "Owner", role: "owner" });
    await GET(new Request("http://admin.test/registrations/export?q=dela&race=5k&page=3&bogus=1"));
    expect(mocks.listRegistrations).toHaveBeenCalledWith(
      "db",
      "owner",
      expect.objectContaining({ q: "dela", race: "5k", status: null, page: 1 }),
    );
    expect(mocks.listRegistrations.mock.calls[0]![2].pageSize).toBeGreaterThan(25);
  });

  it("writes what the query returned and escapes formula cells", async () => {
    const response = await GET(new Request("http://admin.test/registrations/export"));
    // Response.text() drops a leading BOM, so check the bytes: Excel needs it to read UTF-8.
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = (await response.text()).split("\r\n");
    expect(text[0]).toContain("Reference,Race,First name");
    expect(text[1]).toBe(
      "RR-AAAAAAA1,5k,'=Juana,Dela Cruz,j•••@example.com,•••01,M,paid,800.00,gcash," +
        "2026-10-01T02:00:00.000Z,,2026-10-01T01:55:00.000Z",
    );
  });

  it("refuses with a 413 past the cap, as plain text and not a download", async () => {
    mocks.listRegistrations.mockResolvedValue({ rows: [row], total: 10_001 });
    const response = await GET(new Request("http://admin.test/registrations/export"));
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBeNull();
    const body = await response.text();
    expect(body).toContain("Narrow the filters");
    expect(body).toContain("10001");
    expect(body).not.toContain(row.reference);
  });

  it("still exports exactly at the cap", async () => {
    mocks.listRegistrations.mockResolvedValue({ rows: [row], total: 10_000 });
    const response = await GET(new Request("http://admin.test/registrations/export"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });

  it("writes the owner's +63 mobile unprefixed", async () => {
    mocks.requireSession.mockResolvedValue({ userId: "u2", name: "Owner", role: "owner" });
    mocks.listRegistrations.mockResolvedValue({
      rows: [{ ...row, mobile: "+639171234567" }],
      total: 1,
    });
    const response = await GET(new Request("http://admin.test/registrations/export"));
    const line = (await response.text()).split("\r\n")[1]!;
    expect(line).toContain(",+639171234567,");
    expect(line).not.toContain("'+63");
  });

  it("leaves the viewer's masked mobile as the query returned it", async () => {
    const response = await GET(new Request("http://admin.test/registrations/export"));
    expect((await response.text()).split("\r\n")[1]).toContain(",•••01,");
  });
});
