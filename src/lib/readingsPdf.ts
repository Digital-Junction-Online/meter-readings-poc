import type { ReadingRow } from "@/components/ReadingsTable";
import {
  buildServiceSummary,
  clientStatus,
  formatDay,
  formatDayTime,
  formatNumber,
  isService,
  monthShort,
  openIssueIds as computeOpenIssueIds,
  SERVICE_LABEL,
  SERVICE_UNIT,
  todaySA,
  unitTitle,
} from "@/lib/clientReport";
import type { Service } from "@/lib/types";

type RGB = [number, number, number];
type Doc = import("jspdf").jsPDF;

const NAVY: RGB = [12, 31, 61];
const GREEN: RGB = [88, 169, 59];
const BRIGHT_GREEN: RGB = [108, 192, 74];
const INK: RGB = [12, 31, 61];
const BODY: RGB = [67, 83, 106];
const MUTED: RGB = [93, 108, 128];
const BORDER: RGB = [223, 229, 236];
const ZEBRA: RGB = [247, 249, 251];
const AMBER: RGB = [201, 122, 22];
const AMBER_SOFT: RGB = [241, 220, 184];
const AMBER_TEXT: RGB = [122, 84, 16];
const BLUE: RGB = [31, 107, 184];
const RUST: RGB = [154, 52, 18];
const OK_TEXT: RGB = [46, 107, 29];

const SERVICE_ACCENT: Record<Service, RGB> = { electricity: AMBER, water: BLUE };

const MARGIN = 40;

export interface ReportSection {
  propertyName: string;
  clientName?: string | null;
  rows: ReadingRow[];
  /** Full history for the month-by-month charts and comparisons; defaults to `rows`.
   * Pass it when `rows` is a filtered slice (one month, one unit), or the
   * charts would only ever show that slice. */
  chartRows?: ReadingRow[];
  /** Defaults to each meter's latest unchecked flag, as the client sees it. */
  openIssueIds?: Set<string>;
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

function setFill(doc: Doc, c: RGB) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setDraw(doc: Doc, c: RGB) {
  doc.setDrawColor(c[0], c[1], c[2]);
}
function setText(doc: Doc, c: RGB) {
  doc.setTextColor(c[0], c[1], c[2]);
}

function withOpacity(doc: Doc, opacity: number, draw: () => void) {
  const anyDoc = doc as unknown as { GState: new (o: { opacity: number }) => unknown; setGState: (g: unknown) => void };
  anyDoc.setGState(new anyDoc.GState({ opacity }));
  draw();
  anyDoc.setGState(new anyDoc.GState({ opacity: 1 }));
}

function lastY(doc: Doc): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** The brand header, drawn once at the top of page 1. Returns where content starts. */
function drawHeader(doc: Doc, logo: string | null): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  setFill(doc, NAVY);
  doc.rect(0, 0, pageWidth, 96, "F");
  setFill(doc, GREEN);
  doc.rect(0, 96, pageWidth, 4, "F");

  let x = MARGIN;
  if (logo) {
    doc.addImage(logo, "PNG", MARGIN, 18, 60, 60);
    x = MARGIN + 76;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("WAYNE'S", x, 40);
  setText(doc, BRIGHT_GREEN);
  doc.text("METER READINGS", x + doc.getTextWidth("WAYNE'S") + 4, 40);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(21);
  doc.text("Meter readings report", x, 64);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(200, 212, 228);
  doc.text("support@wmfixandfinish.co.za", pageWidth - MARGIN, 44, { align: "right" });
  doc.text("app.wmfixandfinish.co.za", pageWidth - MARGIN, 58, { align: "right" });
  return 100;
}

function drawMeta(doc: Doc, y: number, items: { label: string; value: string }[]): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const colWidth = (pageWidth - MARGIN * 2) / items.length;
  items.forEach((item, i) => {
    const x = MARGIN + i * colWidth;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(item.label, x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    setText(doc, INK);
    const lines = doc.splitTextToSize(item.value, colWidth - 10) as string[];
    doc.text(lines.slice(0, 2), x, y + 14);
  });
  return y + 40;
}

function drawSummaryTiles(doc: Doc, y: number, section: ReportSection, openCount: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 12;
  const w = (pageWidth - MARGIN * 2 - gap * 2) / 3;
  const h = 70;

  const tiles: { accent: RGB; label: string; value: string; unit: string; note: string; noteColor: RGB }[] = [];
  for (const service of ["electricity", "water"] as const) {
    const s = buildServiceSummary(section.chartRows ?? section.rows, service);
    const change =
      s.changePct === null || !s.previous
        ? s.latest
          ? "First month on record"
          : "No readings in this report"
        : `${s.changePct > 0 ? "Up" : s.changePct < 0 ? "Down" : "No change"}${s.changePct !== 0 ? ` ${Math.abs(s.changePct)}%` : ""} vs ${monthShort(s.previous.key)}`;
    tiles.push({
      accent: SERVICE_ACCENT[service],
      label: `${SERVICE_LABEL[service]} used${s.latest ? ` · ${monthShort(s.latest.key)}` : ""}`,
      value: s.latest ? formatNumber(Math.round(s.latest.usage)) : "-",
      unit: s.latest ? SERVICE_UNIT[service] : "",
      note: change,
      noteColor: s.changePct !== null && s.changePct > 0 ? RUST : s.changePct !== null && s.changePct < 0 ? OK_TEXT : MUTED,
    });
  }
  const readings = section.rows.filter((r) => r.kind !== "replacement");
  const meters = new Set(readings.map((r) => r.meter_id)).size;
  const replacements = section.rows.filter((r) => r.kind === "replacement").length;
  const notes = [
    openCount > 0 ? `${openCount} being checked` : "Nothing being checked",
    replacements > 0 ? `${replacements} replaced` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  tiles.push({
    accent: GREEN,
    label: "Readings in this report",
    value: formatNumber(readings.length),
    unit: `from ${meters} meter${meters === 1 ? "" : "s"}`,
    note: notes,
    noteColor: openCount > 0 ? AMBER_TEXT : MUTED,
  });

  tiles.forEach((t, i) => {
    const x = MARGIN + i * (w + gap);
    setDraw(doc, BORDER);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, w, h, 8, 8, "S");
    setFill(doc, t.accent);
    doc.rect(x + 8, y, w - 16, 3.5, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(t.label, x + 12, y + 20);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    setText(doc, INK);
    doc.text(t.value, x + 12, y + 42);
    const valueWidth = doc.getTextWidth(t.value);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(t.unit, x + 16 + valueWidth, y + 42);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(doc, t.noteColor);
    doc.text(doc.splitTextToSize(t.note, w - 24)[0] as string, x + 12, y + 58);
  });
  return y + h + 16;
}

/** Last six months of usage for one service, as the chart draws it. */
function chartMonths(rows: ReadingRow[], service: Service) {
  const months = buildServiceSummary(rows, service).months;
  return months.slice(-6);
}

function drawBarChart(doc: Doc, x: number, y: number, w: number, h: number, rows: ReadingRow[]) {
  const months = chartMonths(rows, "electricity");
  drawChartFrame(doc, x, y, w, h, `Electricity per month (${SERVICE_UNIT.electricity})`);
  if (months.length === 0) return drawEmptyChart(doc, x, y, w, h, "No electricity readings in this report");

  const top = y + 46;
  const base = y + h - 26;
  const plotH = base - top;
  const inner = w - 28;
  const slot = inner / months.length;
  const barW = Math.min(30, slot * 0.6);
  const max = Math.max(...months.map((m) => m.usage), 1);
  const avg = months.reduce((s, m) => s + m.usage, 0) / months.length;

  setDraw(doc, BORDER);
  doc.setLineWidth(0.6);
  doc.line(x + 14, base, x + w - 14, base);

  months.forEach((m, i) => {
    const cx = x + 14 + slot * i + slot / 2;
    const bh = Math.max(2, (m.usage / max) * plotH);
    const latest = i === months.length - 1;
    setFill(doc, latest ? AMBER : AMBER_SOFT);
    doc.roundedRect(cx - barW / 2, base - bh, barW, bh, 4, 4, "F");
    doc.setFont("helvetica", latest ? "bold" : "normal");
    doc.setFontSize(7.5);
    setText(doc, latest ? INK : MUTED);
    doc.text(monthShort(m.key), cx, base + 12, { align: "center" });
    if (latest) {
      const label = formatNumber(Math.round(m.usage));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const lw = doc.getTextWidth(label) + 12;
      setFill(doc, NAVY);
      doc.roundedRect(cx - lw / 2, base - bh - 18, lw, 13, 6.5, 6.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(label, cx, base - bh - 8.6, { align: "center" });
    }
  });

  if (months.length > 1) {
    const ay = base - (avg / max) * plotH;
    setDraw(doc, AMBER_TEXT);
    doc.setLineWidth(0.8);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(x + 14, ay, x + w - 14, ay);
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    setText(doc, AMBER_TEXT);
    doc.text(`AVG ${formatNumber(Math.round(avg))}`, x + 14, ay - 3);
  }
}

function drawLineChart(doc: Doc, x: number, y: number, w: number, h: number, rows: ReadingRow[]) {
  const months = chartMonths(rows, "water");
  drawChartFrame(doc, x, y, w, h, `Water per month (${SERVICE_UNIT.water})`);
  if (months.length === 0) return drawEmptyChart(doc, x, y, w, h, "No water readings in this report");

  const top = y + 50;
  const base = y + h - 26;
  const plotH = base - top;
  const inner = w - 28;
  const slot = inner / months.length;
  const max = Math.max(...months.map((m) => m.usage), 1);
  const points = months.map((m, i) => ({
    x: x + 14 + slot * i + slot / 2,
    y: base - (m.usage / max) * plotH,
    m,
  }));

  setDraw(doc, BORDER);
  doc.setLineWidth(0.6);
  doc.line(x + 14, base, x + w - 14, base);

  if (points.length > 1) {
    // Soft area under the line.
    withOpacity(doc, 0.14, () => {
      setFill(doc, BLUE);
      const segs: number[][] = points.slice(1).map((p, i) => [p.x - points[i].x, p.y - points[i].y]);
      segs.push([0, base - points[points.length - 1].y], [points[0].x - points[points.length - 1].x, 0]);
      doc.lines(segs, points[0].x, points[0].y, [1, 1], "F", true);
    });
    setDraw(doc, BLUE);
    doc.setLineWidth(2);
    for (let i = 1; i < points.length; i++) doc.line(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }

  points.forEach((p, i) => {
    const latest = i === points.length - 1;
    if (latest) {
      setFill(doc, BLUE);
      doc.circle(p.x, p.y, 4, "F");
      const label = formatNumber(Math.round(p.m.usage));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const lw = doc.getTextWidth(label) + 12;
      setFill(doc, NAVY);
      doc.roundedRect(p.x - lw / 2, p.y - 22, lw, 13, 6.5, 6.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(label, p.x, p.y - 12.6, { align: "center" });
    } else {
      doc.setFillColor(255, 255, 255);
      setDraw(doc, BLUE);
      doc.setLineWidth(1.4);
      doc.circle(p.x, p.y, 2.8, "FD");
    }
    doc.setFont("helvetica", latest ? "bold" : "normal");
    doc.setFontSize(7.5);
    setText(doc, latest ? INK : MUTED);
    doc.text(monthShort(p.m.key), p.x, base + 12, { align: "center" });
  });
}

function drawChartFrame(doc: Doc, x: number, y: number, w: number, h: number, title: string) {
  setDraw(doc, BORDER);
  doc.setLineWidth(0.8);
  doc.roundedRect(x, y, w, h, 8, 8, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  setText(doc, INK);
  doc.text(title, x + 12, y + 20);
}

function drawEmptyChart(doc: Doc, x: number, y: number, w: number, h: number, text: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, MUTED);
  doc.text(text, x + w / 2, y + h / 2 + 6, { align: "center" });
}

function statusFor(row: ReadingRow, open: Set<string>): { label: string; color: RGB } {
  if (row.kind === "replacement") return { label: "Meter replaced", color: BLUE };
  const s = clientStatus(row, open.has(row.id));
  if (s.tone === "good") return { label: s.label, color: OK_TEXT };
  if (s.tone === "watch") return { label: s.label, color: AMBER_TEXT };
  return { label: s.label, color: MUTED };
}

async function drawSection(doc: Doc, startY: number, section: ReportSection, showTitle: boolean): Promise<void> {
  const { autoTable } = await import("jspdf-autotable");
  const pageWidth = doc.internal.pageSize.getWidth();
  const open = section.openIssueIds ?? computeOpenIssueIds(section.rows);
  let y = startY;

  if (showTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setText(doc, INK);
    doc.text(section.propertyName, MARGIN, y);
    if (section.clientName) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      setText(doc, MUTED);
      doc.text(section.clientName, MARGIN, y + 14);
    }
    y += section.clientName ? 30 : 18;
  }

  y = drawSummaryTiles(doc, y, section, open.size);

  const chartGap = 12;
  const chartW = (pageWidth - MARGIN * 2 - chartGap) / 2;
  const chartH = 150;
  const history = section.chartRows ?? section.rows;
  drawBarChart(doc, MARGIN, y, chartW, chartH, history);
  drawLineChart(doc, MARGIN + chartW + chartGap, y, chartW, chartH, history);
  y += chartH + 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setText(doc, INK);
  doc.text("Readings", MARGIN, y);
  y += 8;

  const body = section.rows.map((r) => {
    const known = isService(r.service);
    const unit = known ? SERVICE_UNIT[r.service as Service] : "";
    const label = known ? SERVICE_LABEL[r.service as Service] : r.service;
    const previous = r.previous_value !== null ? formatNumber(r.previous_value) : "-";
    const used =
      r.kind === "replacement"
        ? "-"
        : r.usage !== null && r.usage >= 0
          ? `${formatNumber(r.usage)} ${unit}`
          : "-";
    return [
      formatDayTime(r.captured_at),
      unitTitle(r.unit_number),
      label,
      previous,
      formatNumber(r.reading_value),
      used,
      statusFor(r, open).label,
    ];
  });

  if (body.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, MUTED);
    doc.text("No readings match this report.", MARGIN, y + 16);
    y += 30;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 56, top: 40 },
      head: [["Date", "Unit", "Service", "Previous", "Current", "Used", "Status"]],
      body,
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        textColor: INK,
        cellPadding: { top: 5.5, bottom: 5.5, left: 6, right: 6 },
        lineColor: BORDER,
        lineWidth: { bottom: 0.4, top: 0, left: 0, right: 0 },
      },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5, lineWidth: 0 },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        1: { fontStyle: "bold" },
        3: { halign: "right", textColor: BODY },
        4: { halign: "right" },
        5: { halign: "right", fontStyle: "bold" },
      },
      showHead: "everyPage",
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = section.rows[data.row.index];
        if (data.column.index === 2 && isService(row.service)) {
          data.cell.styles.textColor = row.service === "water" ? BLUE : AMBER_TEXT;
        }
        if (data.column.index === 6) {
          const s = statusFor(row, open);
          data.cell.styles.textColor = s.color;
          data.cell.styles.fontStyle = s.color === MUTED ? "normal" : "bold";
        }
      },
    });
    y = lastY(doc) + 18;
  }

  // Notices: what's being checked and which meters were swapped.
  const notices: string[] = [];
  for (const r of section.rows) {
    if (r.kind === "replacement" && r.replacementDetail) {
      notices.push(
        `${unitTitle(r.unit_number)} ${SERVICE_LABEL[r.service as Service]?.toLowerCase() ?? ""} meter replaced on ${formatDay(r.captured_at)}: old meter closed at ${formatNumber(r.replacementDetail.closingValue)}, new meter opened at ${formatNumber(r.replacementDetail.openingValue)}.`
      );
    } else if (open.has(r.id)) {
      notices.push(
        `${unitTitle(r.unit_number)} ${SERVICE_LABEL[r.service as Service]?.toLowerCase() ?? ""} (${formatDay(r.captured_at)}): ${
          clientStatus(r, true).detail ?? "being checked."
        }`
      );
    }
  }
  if (notices.length > 0) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const w = pageWidth - MARGIN * 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = notices.flatMap((n) => doc.splitTextToSize(`•  ${n}`, w - 24) as string[]);
    const h = 30 + lines.length * 12;
    if (y + h > pageHeight - 60) {
      doc.addPage();
      y = 50;
    }
    doc.setFillColor(253, 246, 234);
    doc.setDrawColor(235, 214, 174);
    doc.setLineWidth(0.8);
    doc.roundedRect(MARGIN, y, w, h, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(94, 63, 10);
    doc.text("Notices", MARGIN + 12, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(lines, MARGIN + 12, y + 32);
  }
}

export interface ReportPdfOptions {
  /** Who the report is for: the client's name, or e.g. "All clients". */
  preparedFor: string;
  /** What it covers: a property name, or "All properties". */
  scopeLabel: string;
  periodText: string;
  /** Extra filters in words, e.g. 'Unit "101" · Electricity'. */
  filterText?: string | null;
  sections: ReportSection[];
}

/**
 * Builds a styled readings report as a PDF, entirely in the browser. One
 * section per property: a client's report has one (theirs), an admin's "all
 * properties" report has one per property, each on its own page. jsPDF is
 * imported on demand so it never weighs down the first page load.
 */
export async function buildReadingsPdf(opts: ReportPdfOptions): Promise<Doc> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logo = await loadImageDataUrl("/icons/icon-192.png");
  let y = drawHeader(doc, logo);
  y = drawMeta(doc, y + 26, [
    { label: "Prepared for", value: opts.preparedFor },
    { label: "Property", value: opts.scopeLabel },
    { label: "Period", value: opts.filterText ? `${opts.periodText} · ${opts.filterText}` : opts.periodText },
    { label: "Generated", value: formatDay(new Date().toISOString()) },
  ]);

  const multi = opts.sections.length > 1;
  for (let i = 0; i < opts.sections.length; i++) {
    if (i > 0) {
      doc.addPage();
      y = 50;
    }
    await drawSection(doc, multi ? y + 10 : y, opts.sections[i], multi);
  }
  if (opts.sections.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setText(doc, MUTED);
    doc.text("There are no readings to include in this report.", MARGIN, y + 20);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setDraw(doc, GREEN);
    doc.setLineWidth(1.2);
    doc.line(MARGIN, pageHeight - 38, pageWidth - MARGIN, pageHeight - 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, MUTED);
    doc.text(`${opts.scopeLabel}  |  Every reading is backed by a meter photo, viewable in the app.`, MARGIN, pageHeight - 24);
    doc.text(`Page ${i} of ${pages}`, pageWidth - MARGIN, pageHeight - 24, { align: "right" });
  }

  return doc;
}

/** Builds the report and saves it to the device. */
export async function downloadReadingsPdf(opts: ReportPdfOptions): Promise<void> {
  const doc = await buildReadingsPdf(opts);
  doc.save(`${slug(opts.scopeLabel)}-meter-report-${todaySA()}.pdf`);
}
