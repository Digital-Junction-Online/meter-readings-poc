"use client";

/**
 * This reading / Last reading / Used, as Wayne writes them on his correction
 * sheets. Both readings are editable and Used follows live, so he can see the
 * month come right before saving.
 */
export function ReadingCorrectionFields({
  value,
  onValueChange,
  previousValue,
  onPreviousValueChange,
  unitWord,
}: {
  value: string;
  onValueChange: (v: string) => void;
  /** null when this is the meter's first reading: there is no last reading to fix. */
  previousValue: string | null;
  onPreviousValueChange: (v: string) => void;
  unitWord: string;
}) {
  const current = Number.parseFloat(value);
  const previous = previousValue === null ? Number.NaN : Number.parseFloat(previousValue);
  const used =
    previousValue !== null && !Number.isNaN(current) && !Number.isNaN(previous)
      ? Math.round((current - previous) * 100) / 100
      : null;

  const inputClass =
    "h-[50px] w-full rounded-xl border-[1.5px] border-border-strong bg-surface px-3.5 font-mono text-lg font-bold text-navy-900 outline-none tabular-nums focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15";

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
        This reading
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={inputClass}
        />
      </label>

      {previousValue !== null && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy-900">
          Last reading
          <input
            type="text"
            inputMode="decimal"
            value={previousValue}
            onChange={(e) => onPreviousValueChange(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs font-normal text-[#5d6c80]">
            Correct this if last month was typed wrong, for example 6870.5 instead of 68705 on a meter
            with no decimal point.
          </span>
        </label>
      )}

      {used !== null && (
        <p
          className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold ${
            used < 0 ? "bg-red-50 text-red-700" : "bg-app-bg text-navy-900"
          }`}
        >
          Used: <span className="font-mono tabular-nums">{used.toLocaleString("en-US")}</span> {unitWord}
          {used < 0 && " (lower than last reading, check both numbers)"}
        </p>
      )}
    </div>
  );
}
