import { getDb } from "@rr/db";
import { listRegistrations } from "@rr/db/admin";
import { requireSession } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { parseListParams, type SearchParams } from "@/lib/search-params";

/**
 * The most rows one export holds. Past it the export is refused (413) rather than cut short, so a
 * file is never silently incomplete. The weekly reseed keeps the table to a few hundred rows.
 */
const EXPORT_LIMIT = 10_000;

const HEADER = [
  "Reference",
  "Race",
  "First name",
  "Last name",
  "Email",
  "Mobile",
  "Shirt size",
  "Status",
  "Amount (PHP)",
  "Payment method",
  "Paid at",
  "Email sent at",
  "Registered at",
] as const;

/** Excel reads a CSV as UTF-8 (names with ñ) only when it starts with a byte order mark. */
const BOM = String.fromCharCode(0xfeff);

const pesos = (centavos: number) => (centavos / 100).toFixed(2);

/**
 * The registrations list as CSV, with the same search and filters as the page (its query string)
 * and the same masking: the query masks a viewer's email and mobile, and this only writes what it
 * returned. The login is checked here, not left to the proxy or the layout, which a route handler
 * doesn't run under.
 */
export async function GET(request: Request) {
  const session = await requireSession();

  const query: SearchParams = {};
  const { searchParams } = new URL(request.url);
  for (const key of new Set(searchParams.keys())) query[key] = searchParams.getAll(key);
  const params = parseListParams(query);

  const { rows, total } = await listRegistrations(getDb(), session.role, {
    ...params,
    page: 1,
    pageSize: EXPORT_LIMIT,
  });

  if (total > EXPORT_LIMIT) {
    return new Response(
      `Too many rows to export (${total}, the limit is ${EXPORT_LIMIT}). Narrow the filters and try again.`,
      {
        status: 413,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }

  const csv = toCsv(
    HEADER,
    rows.map((row) => [
      row.reference,
      row.race,
      row.firstName,
      row.lastName,
      row.email,
      row.mobile,
      row.shirtSize,
      row.status,
      pesos(row.amountCentavos),
      row.paymentMethod,
      row.paidAt?.toISOString(),
      row.confirmationSentAt?.toISOString(),
      row.createdAt.toISOString(),
    ]),
  );

  return new Response(`${BOM}${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="registrations.csv"',
      "Cache-Control": "no-store",
    },
  });
}
