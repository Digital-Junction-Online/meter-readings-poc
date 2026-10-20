"use client";

import { useMemo } from "react";
import {
  biggestMovers,
  buildUnitInsights,
  formatNumber,
  monthLabel,
  possibleLeaks,
  ratioPhrase,
  SERVICE_COLOR,
  SERVICE_LABEL,
  SERVICE_UNIT,
  sharePct,
  topUsers,
  type ServiceSummary,
  type UnitInsight,
} from "@/lib/clientReport";
import type { ReadingRow } from "@/components/ReadingsTable";

/**
 * The per-unit half of Usage insights. The cards above say what the property
 * used; this says which units it was, which of them moved, and which are
 * worth someone walking over to look at.
 *
 * It reads the same rows the dashboard already has — one property's readings,
 * scoped by RLS — so every unit named here belongs to this client.
 */
export function UnitInsights({
  rows,
  summary,
  onOpenUnit,
}: {
  rows: ReadingRow[];
  summary: ServiceSummary;
  /** Jumps to the readings list filtered to that unit. */
  onOpenUnit?: (unitNumber: string) => void;
}) {
  const { service, latest, inProgress } = summary;
  const latestKey = latest?.key ?? null;

  const insights = useMemo(
    () => (latestKey ? buildUnitInsights(rows, service, latestKey) : []),
    [rows, service, latestKey]
  );
  const top = useMemo(() => topUsers(insights), [insights]);
  const movers = useMemo(() => (inProgress ? [] : biggestMovers(insights)), [insights, inProgress]);
  const leaks = useMemo(
    () => (inProgress || !latestKey ? [] : possibleLeaks(insights, latestKey)),
    [insights, inProgress, latestKey]
  );
  const suspects = insights.filter((u) => u.suspect);

  if (!latestKey || top.length === 0) return null;

  const unit = SERVICE_UNIT[service];
  const color = SERVICE_COLOR[service];
  const biggest = top[0].latest ?? 0;

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-5"
      aria-label={`${SERVICE_LABEL[service]} by unit`}
    >
      <div>
        <h3 className="text-base font-bold text-navy-900">
          {SERVICE_LABEL[service]} by unit
        </h3>
        <p className="mt-0.5 text-[13px] text-[#5d6c80]">
          Your own units for {monthLabel(latestKey)}
        </p>
      </div>

      {leaks.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-sm font-bold text-amber-900">Worth checking</p>
          <p className="mt-1 text-sm text-amber-900">
            {leaks.length === 1 ? "This unit has" : "These units have"} been well above
            {leaks.length === 1 ? " its" : " their"} usual for two months running, which is what a
            slow leak or a running toilet looks like on monthly readings.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {leaks.map((u) => (
              <li key={u.unitNumber} className="text-sm font-semibold text-amber-900">
                {u.label} — {formatNumber(Math.round(u.latest ?? 0))} {unit},{" "}
                {ratioPhrase(u.ratio ?? 1)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-bold text-navy-900">Which units used the most</p>
        <ul className="mt-2 flex flex-col gap-2">
          {top.map((u) => (
            <li key={u.unitNumber}>
              <UnitBar
                insight={u}
                unit={unit}
                color={color}
                widthPct={biggest > 0 ? ((u.latest ?? 0) / biggest) * 100 : 0}
                onOpen={onOpenUnit}
              />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-sm font-bold text-navy-900">Which units changed most</p>
        {inProgress ? (
          <p className="mt-1.5 text-sm text-text-body">
            This month&apos;s round is still under way, so there isn&apos;t a fair comparison yet.
          </p>
        ) : movers.length === 0 ? (
          <p className="mt-1.5 text-sm text-text-body">
            Every unit is close to its own usual this month — nothing standing out.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {movers.map((u) => {
              const up = (u.delta ?? 0) > 0;
              return (
                <li key={u.unitNumber} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                  <span className={`font-bold ${up ? "text-amber-700" : "text-green-700"}`}>
                    {up ? "▲" : "▼"} {u.label}
                  </span>
                  <span className="text-text-body">
                    {ratioPhrase(u.ratio ?? 1)} — {up ? "up" : "down"}{" "}
                    {formatNumber(Math.abs(Math.round(u.delta ?? 0)))} {unit} on a usual month
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {suspects.length > 0 && (
        <p className="border-t border-divider pt-3 text-[13px] text-[#5d6c80]">
          {suspects.length === 1 ? "A reading" : "Readings"} on{" "}
          {suspects.map((u) => u.label).join(", ")} {suspects.length === 1 ? "is" : "are"} far beyond
          anything that meter has recorded before, so {suspects.length === 1 ? "it is" : "they are"}{" "}
          being checked and left out of the figures above.
        </p>
      )}
    </section>
  );
}

function UnitBar({
  insight,
  unit,
  color,
  widthPct,
  onOpen,
}: {
  insight: UnitInsight;
  unit: string;
  color: string;
  widthPct: number;
  onOpen?: (unitNumber: string) => void;
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-navy-900">{insight.label}</span>
        <span className="shrink-0 text-sm text-text-body">
          <span className="font-mono font-bold text-navy-900 tabular-nums">
            {formatNumber(Math.round(insight.latest ?? 0))}
          </span>{" "}
          {unit}
          {insight.share > 0 && (
            <span className="ml-1.5 text-[13px] text-[#5d6c80]">{sharePct(insight.share)}</span>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-divider">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(widthPct, 2)}%`, backgroundColor: color }}
        />
      </div>
    </>
  );

  if (!onOpen) return <div>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(insight.unitNumber)}
      className="w-full rounded-lg px-1 py-1 text-left hover:bg-app-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
      aria-label={`${insight.label} used ${formatNumber(Math.round(insight.latest ?? 0))} ${unit}. See its readings.`}
    >
      {body}
    </button>
  );
}
