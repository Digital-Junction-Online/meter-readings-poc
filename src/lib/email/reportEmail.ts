import { formatDate } from "@/lib/date";
import type { ReadingRow } from "@/components/ReadingsTable";

const FLAG_LABEL: Record<ReadingRow["flag_status"], string> = {
  ok: "OK",
  below_prev: "Below previous",
  above_2x_avg: "Above 2x average",
  possible_partial: "Possible partial entry",
};

const FLAG_COLOR: Record<ReadingRow["flag_status"], string> = {
  ok: "#2f7a3e",
  below_prev: "#b3261e",
  above_2x_avg: "#b3611e",
  possible_partial: "#58a93b",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * A self-contained, inline-styled HTML report — email clients strip
 * <style> blocks and external stylesheets unpredictably, so every rule
 * lives on the element. Deliberately not the app's live report view: no
 * charts, no filters, just the numbers, sized for skimming on a phone.
 */
export function buildReportEmailHtml(params: {
  clientName: string;
  propertyName: string;
  periodLabel: string;
  rows: ReadingRow[];
  dashboardUrl: string;
}): string {
  const { clientName, propertyName, periodLabel, rows, dashboardUrl } = params;
  const readingRows = rows.filter((r) => r.kind !== "replacement");
  const flaggedCount = readingRows.filter((r) => r.flag_status !== "ok").length;

  const tableRows = rows
    .map((r) => {
      const isReplacement = r.kind === "replacement";
      const usage = r.usage !== null ? r.usage.toLocaleString("en-US") : "—";
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;white-space:nowrap;">${formatDate(r.captured_at)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(r.unit_number)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-transform:capitalize;">${escapeHtml(r.service)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#0c1f3d;font-weight:600;text-align:right;">${
            isReplacement ? "Meter replaced" : r.reading_value.toLocaleString("en-US")
          }</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:right;">${isReplacement ? "—" : usage}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${FLAG_COLOR[r.flag_status]};font-weight:600;">${
            isReplacement ? "—" : FLAG_LABEL[r.flag_status]
          }</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
            <tr>
              <td style="background:#0c1f3d;padding:22px 28px;">
                <p style="margin:0;color:#58a93b;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Wayne's Meter Readings</p>
                <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;">${escapeHtml(propertyName)}</h1>
                <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">${escapeHtml(clientName)} · ${escapeHtml(periodLabel)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:10px 14px;background:#f4f4f5;border-radius:10px;" width="33%">
                      <p style="margin:0;font-size:11px;color:#6b7280;">Readings</p>
                      <p style="margin:2px 0 0;font-size:18px;font-weight:700;color:#0c1f3d;">${readingRows.length}</p>
                    </td>
                    <td width="6"></td>
                    <td style="padding:10px 14px;background:#f4f4f5;border-radius:10px;" width="33%">
                      <p style="margin:0;font-size:11px;color:#6b7280;">Flagged</p>
                      <p style="margin:2px 0 0;font-size:18px;font-weight:700;color:${flaggedCount > 0 ? "#b3611e" : "#0c1f3d"};">${flaggedCount}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th align="left" style="padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Date</th>
                      <th align="left" style="padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Unit</th>
                      <th align="left" style="padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Service</th>
                      <th align="right" style="padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Reading</th>
                      <th align="right" style="padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Usage</th>
                      <th align="left" style="padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      rows.length > 0
                        ? tableRows
                        : `<tr><td colspan="6" style="padding:16px 10px;font-size:13px;color:#6b7280;">No readings in this period.</td></tr>`
                    }
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 26px;">
                <a href="${dashboardUrl}" style="display:inline-block;background:#58a93b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:999px;">View full report &amp; photos online</a>
                <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
                  Sent by Wayne's Meter Readings. Reply to this email or contact support@wmfixandfinish.co.za with any questions.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
