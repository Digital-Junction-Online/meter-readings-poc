"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip, compactNumber } from "@/components/charts/chartBits";
import { monthLabel } from "@/lib/clientReport";
import type { Service } from "@/lib/types";

export interface UsagePoint {
  /** yyyy-mm */
  month: string;
  /** Short axis label, e.g. "Sep". */
  label: string;
  usage: number;
}

type Variant = "dark" | "light";

const PALETTE = {
  electricity: { strong: "#c97a16", top: "#f6c06e", softLight: "#f6e6cb", avgLight: "#9a6712" },
  water: { strong: "#1f6bb8", top: "#7fb4ea", softLight: "#cfe0f3", avgLight: "#1f6bb8" },
} as const;

const UNIT: Record<Service, string> = { electricity: "kWh", water: "kL" };

/**
 * Month-by-month usage in the redesign's style: electricity as rounded bars
 * with the latest month picked out and labelled, water as a soft area line.
 * A dashed line marks the average so an unusual month reads at a glance.
 * `dark` sits on a navy card (admin reports), `light` on white (client).
 */
export function UsageTrendChart({
  service,
  data,
  variant = "light",
  height = 180,
  showAxis = false,
  animate = true,
}: {
  service: Service;
  data: UsagePoint[];
  variant?: Variant;
  height?: number;
  /** Show a value axis — useful for admins spotting an inflated month. */
  showAxis?: boolean;
  animate?: boolean;
}) {
  if (data.length === 0) return null;

  const p = PALETTE[service];
  const dark = variant === "dark";
  const id = `usage-${service}-${variant}`;
  const average = data.length > 1 ? data.reduce((sum, d) => sum + d.usage, 0) / data.length : null;
  const lastIndex = data.length - 1;
  const tickColor = dark ? "rgba(255,255,255,0.62)" : "#5d6c80";
  const gridColor = dark ? "rgba(255,255,255,0.08)" : "#eef2f6";
  const avgColor = dark ? "#6cc04a" : p.avgLight;

  const tooltip = (
    <Tooltip
      cursor={{ fill: dark ? "rgba(255,255,255,0.06)" : "rgba(12,31,61,0.04)", radius: 8 }}
      content={<ChartTooltip suffix={UNIT[service]} labelFormatter={(l) => monthLabel(data.find((d) => d.label === l)?.month ?? l)} />}
    />
  );
  const xAxis = (
    <XAxis
      dataKey="label"
      tickLine={false}
      axisLine={false}
      interval={0}
      tick={(raw: unknown) => {
        const props = raw as { x: number | string; y: number | string; payload: { value: string; index: number } };
        return (
        <text
          x={Number(props.x)}
          y={Number(props.y) + 12}
          textAnchor="middle"
          fontSize={11}
          fontWeight={props.payload.index === lastIndex ? 700 : 500}
          fill={props.payload.index === lastIndex ? (dark ? "#ffffff" : "#0c1f3d") : tickColor}
        >
          {props.payload.value}
        </text>
        );
      }}
    />
  );
  const yAxis = showAxis ? (
    <YAxis width={42} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: tickColor }} tickFormatter={compactNumber} />
  ) : (
    <YAxis hide domain={[0, "dataMax"]} />
  );
  const avgLine =
    average !== null ? (
      <ReferenceLine
        y={average}
        stroke={avgColor}
        strokeDasharray="4 5"
        strokeWidth={1.5}
        label={{
          value: `AVG ${compactNumber(average)}`,
          position: "insideTopLeft",
          fill: avgColor,
          fontSize: 10,
          fontWeight: 700,
        }}
      />
    ) : null;

  // The value pill above the latest month.
  const renderPill = (raw: unknown) => {
    const props = raw as {
      x?: number | string;
      y?: number | string;
      width?: number | string;
      value?: number | string;
      index?: number;
      /** The plot area, which recharts passes down with every label. */
      parentViewBox?: { x?: number; width?: number };
    };
    if (props.index !== lastIndex) return null;
    const y = Number(props.y ?? 0);
    const text = Number(props.value ?? 0).toLocaleString("en-US");
    const w = text.length * 7 + 16;

    // The latest month sits hard against the right edge, so centring a wide
    // value on it pushes half the pill outside the SVG, where it's clipped.
    // Keep it inside the plot area and let it sit off-centre instead.
    const centre = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
    const plot = props.parentViewBox;
    const plotLeft = plot?.x ?? 0;
    const plotRight = plot?.width != null ? plotLeft + plot.width : null;
    let left = centre - w / 2;
    if (plotRight !== null) left = Math.min(left, plotRight - w);
    left = Math.max(left, plotLeft);
    const textX = left + w / 2;

    return (
      <g>
        <rect x={left} y={y - 26} width={w} height={20} rx={10} fill={dark ? "#ffffff" : "#0c1f3d"} />
        <text x={textX} y={y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="var(--font-jetbrains-mono)" fill={dark ? "#0c1f3d" : "#ffffff"}>
          {text}
        </text>
      </g>
    );
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {service === "electricity" ? (
          <BarChart data={data} margin={{ top: 30, right: 6, bottom: 4, left: showAxis ? 0 : 6 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.top} />
                <stop offset="100%" stopColor={p.strong} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={gridColor} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Bar dataKey="usage" radius={[8, 8, 3, 3]} maxBarSize={44} isAnimationActive={animate}>
              {data.map((d, i) => (
                <Cell
                  key={d.month}
                  fill={i === lastIndex ? `url(#${id})` : dark ? "rgba(255,255,255,0.16)" : p.softLight}
                />
              ))}
              <LabelList dataKey="usage" content={renderPill} />
            </Bar>
            {avgLine}
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 30, right: 14, bottom: 4, left: showAxis ? 0 : 14 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={dark ? p.top : p.strong} stopOpacity={dark ? 0.4 : 0.28} />
                <stop offset="100%" stopColor={dark ? p.top : p.strong} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={gridColor} />
            {xAxis}
            {yAxis}
            {tooltip}
            {avgLine}
            <Area
              type="monotone"
              isAnimationActive={animate}
              dataKey="usage"
              stroke={dark ? p.top : p.strong}
              strokeWidth={3}
              fill={`url(#${id})`}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const last = props.index === lastIndex;
                return (
                  <circle
                    key={`dot-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={last ? 5.5 : 3.5}
                    fill={last ? (dark ? p.top : p.strong) : dark ? "#0c1f3d" : "#ffffff"}
                    stroke={dark ? p.top : p.strong}
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 6, strokeWidth: 0, fill: dark ? p.top : p.strong }}
            >
              <LabelList
                dataKey="usage"
                content={(raw: unknown) => {
                  const props = raw as { y?: number | string };
                  return renderPill({ ...(raw as object), width: 0, y: Number(props.y ?? 0) - 4 });
                }}
              />
            </Area>
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
