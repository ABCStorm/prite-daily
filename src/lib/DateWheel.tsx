import React, { useMemo } from "react";
import { WheelPicker } from "./WheelPicker";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function daysIn(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1) return null;
  return { year, month, day };
}

export function formatLongDate(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  return new Date(p.year, p.month - 1, p.day).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function DateWheel({
  value,
  onChange,
  ariaLabel = "Date",
}: {
  value: string;
  onChange: (ymd: string) => void;
  ariaLabel?: string;
}) {
  const parsed = parseYmd(value) ?? { year: new Date().getFullYear(), month: 10, day: 6 };
  const nowYear = new Date().getFullYear();
  const yearStart = Math.min(parsed.year, nowYear - 1);
  const yearEnd = Math.max(parsed.year, nowYear + 5);
  const years = useMemo(
    () => Array.from({ length: yearEnd - yearStart + 1 }, (_, i) => String(yearStart + i)),
    [yearStart, yearEnd],
  );
  const year = parsed.year;
  const month = parsed.month;
  const dayCount = daysIn(month, year);
  const day = Math.min(parsed.day, dayCount);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => String(i + 1)),
    [dayCount],
  );

  const setPart = (nextYear: number, nextMonth: number, nextDay: number) => {
    const max = daysIn(nextMonth, nextYear);
    onChange(toYmd(nextYear, nextMonth, Math.min(nextDay, max)));
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 4,
        borderRadius: 20,
        border: "1px solid #ece5d8",
        background: "#fff",
        padding: 8,
      }}
    >
      <WheelPicker
        options={MONTHS}
        value={String(month)}
        onValueChange={(v) => setPart(year, Number(v), day)}
        visibleCount={7}
        itemHeight={40}
        aria-label="Month"
        style={{ width: 132, flex: "1 1 132px" }}
      />
      <WheelPicker
        options={days}
        value={String(day)}
        onValueChange={(v) => setPart(year, month, Number(v))}
        visibleCount={7}
        itemHeight={40}
        aria-label="Day"
        style={{ width: 56, flex: "0 0 56px" }}
      />
      <WheelPicker
        options={years}
        value={String(year)}
        onValueChange={(v) => setPart(Number(v), month, day)}
        visibleCount={7}
        itemHeight={40}
        aria-label="Year"
        style={{ width: 76, flex: "0 0 76px" }}
      />
    </div>
  );
}
