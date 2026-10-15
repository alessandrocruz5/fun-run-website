import { beforeEach, describe, expect, it, vi } from "vitest";
import RegistrationPage from "../../../../app/(dashboard)/registrations/[reference]/page";
import RegistrationsPage from "../../../../app/(dashboard)/registrations/page";

// A viewer's data is masked in the query layer by the role argument. These pages must hand the
// queries the signed-in organizer's role from requireSession(), never a literal.
const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  listRegistrations: vi.fn(),
  getRegistration: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@rr/db", () => ({ getDb: () => "db" }));
vi.mock("@rr/db/admin", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listRegistrations: mocks.listRegistrations,
  getRegistration: mocks.getRegistration,
}));

const REFERENCE = "RR-AAAAAAA1";

const list = { rows: [], total: 0, page: 1, pageCount: 1, pageSize: 25 };

const registration = {
  reference: REFERENCE,
  race: "5k",
  firstName: "Juana",
  lastName: "Dela Cruz",
  email: "j•••@example.com",
  mobile: "•••01",
  birthdate: null,
  emergencyContactName: null,
  emergencyContactMobile: null,
  shirtSize: "M",
  consentAt: new Date("2026-10-01T01:50:00Z"),
  status: "paid",
  amountCentavos: 80_000,
  feeCentavos: null,
  netCentavos: null,
  paymentMethod: "gcash",
  paymentId: null,
  paidAt: new Date("2026-10-01T02:00:00Z"),
  confirmationSentAt: null,
  createdAt: new Date("2026-10-01T01:55:00Z"),
};

const listProps = { searchParams: Promise.resolve({}) };
const detailProps = {
  params: Promise.resolve({ reference: REFERENCE }),
  searchParams: Promise.resolve({}),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listRegistrations.mockResolvedValue(list);
  mocks.getRegistration.mockResolvedValue(registration);
});

describe.each(["owner", "viewer"] as const)("the dashboard pages as %s", (role) => {
  beforeEach(() => {
    mocks.requireSession.mockResolvedValue({ userId: "u1", name: "Organizer", role });
  });

  it("lists registrations with the session's role", async () => {
    await RegistrationsPage(listProps);
    expect(mocks.listRegistrations).toHaveBeenCalledTimes(1);
    expect(mocks.listRegistrations).toHaveBeenCalledWith(
      "db",
      role,
      expect.objectContaining({ page: 1 }),
    );
  });

  it("reads one registration with the session's role", async () => {
    await RegistrationPage(detailProps);
    expect(mocks.getRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.getRegistration).toHaveBeenCalledWith("db", role, REFERENCE);
  });
});

describe("the dashboard pages when signed out", () => {
  beforeEach(() => {
    mocks.requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it("reads nothing on the list page", async () => {
    await expect(RegistrationsPage(listProps)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listRegistrations).not.toHaveBeenCalled();
  });

  it("reads nothing on the detail page", async () => {
    await expect(RegistrationPage(detailProps)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getRegistration).not.toHaveBeenCalled();
  });
});

describe("the detail page for an unknown reference", () => {
  it("is a not-found, still queried with the session's role", async () => {
    mocks.requireSession.mockResolvedValue({ userId: "u1", name: "Demo", role: "viewer" });
    mocks.getRegistration.mockResolvedValue(null);
    await expect(RegistrationPage(detailProps)).rejects.toThrow();
    expect(mocks.getRegistration).toHaveBeenCalledWith("db", "viewer", REFERENCE);
  });
});
