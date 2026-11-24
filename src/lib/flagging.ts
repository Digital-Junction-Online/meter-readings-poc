import type { FlagStatus } from "@/lib/types";

// A valid reading is just digits with an optional decimal point. Anything else
// (a trailing OCR letter like "124937.26e", a stray extra token like "280891 0",
// an embedded unit like "7192.133m3") parses as a number but silently drops or
// mangles part of the value — reject the whole shape, not just known typos.
const VALID_READING_PATTERN = /^\d+(\.\d+)?$/;

/** How far above its own usual consumption a meter has to jump to be flagged. */
export const SPIKE_MULTIPLE = 3;

export function looksLikePartialEntry(raw: string): boolean {
  return !VALID_READING_PATTERN.test(raw.trim());
}

/** A decimal point typed on a meter whose dial has none (meters.whole_numbers). */
export function hasDecimalOnWholeMeter(raw: string, wholeNumbers: boolean | undefined): boolean {
  return !!wholeNumbers && raw.includes(".");
}

export const WHOLE_NUMBER_MESSAGE =
  "This meter has no decimal point. Type the whole number on the dial, for example 68705, not 6870.5.";

/**
 * Mean of a meter's own prior consumption, for judging whether a new reading
 * is a plausible next step for THIS meter.
 *
 * `readingValues` is that meter's history, newest first. Only increases count:
 * a decrease is either a misread or a meter swap, and averaging it in would
 * drag the baseline down and make the next normal month look like a spike.
 */
export function trailingAverageUsage(readingValues: number[]): number | null {
  const deltas: number[] = [];
  for (let i = 0; i < readingValues.length - 1; i++) {
    const delta = readingValues[i] - readingValues[i + 1];
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return null;
  return deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
}

/**
 * `above_2x_avg` compares this reading's CONSUMPTION against the same meter's
 * own trailing average — the comparison the capture screen already shows the
 * reader ("in line with this meter's recent history").
 *
 * It previously compared absolute cumulative dial values across sibling
 * meters, so any meter whose dial simply read higher than its neighbours' was
 * flagged every single month regardless of how much it had actually used.
 * That produced enough standing false alarms to make the review queue not
 * worth reading. The stored key keeps its original name because live rows
 * carry it under a CHECK constraint; what it means is "well above this
 * meter's own average".
 */
export function computeFlagStatus(params: {
  rawValue: string;
  value: number;
  previousValueForMeter: number | null;
  trailingAverageForMeter: number | null;
}): FlagStatus {
  const { rawValue, value, previousValueForMeter, trailingAverageForMeter } = params;

  if (looksLikePartialEntry(rawValue)) {
    return "possible_partial";
  }

  if (previousValueForMeter !== null && value < previousValueForMeter) {
    return "below_prev";
  }

  if (previousValueForMeter !== null && trailingAverageForMeter !== null && trailingAverageForMeter > 0) {
    const usage = value - previousValueForMeter;
    if (usage > trailingAverageForMeter * SPIKE_MULTIPLE) {
      return "above_2x_avg";
    }
  }

  return "ok";
}
