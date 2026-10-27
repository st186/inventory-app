import * as React from "react";
import { CalendarDays, ChevronDown } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { IconButton } from "./icon-button";
import { MonthCalendar } from "./month-calendar";
import { ResponsiveModal } from "./responsive-modal";
import {
  addDaysISO,
  diffDays,
  monthYearLabel,
  parseISODate,
  todayIST,
  weekdayShort,
  type ISODate,
} from "./date-utils";
import { useT } from "../../utils/i18n";

// The one date control for day-based screens: the last 7 days as a strip (today marked,
// selected = primary-soft), plus a calendar button (and optionally a month label) that opens a
// calendar sheet for any other date. Replaces the date input + Prev/Next week buttons.
//
//   <DateStrip value={date} onChange={setDate} max={todayIST()} />

export type DateStripProps = {
  value: ISODate;
  onChange: (date: ISODate) => void;
  min?: ISODate;
  max?: ISODate;
  /** How many days the strip shows (default 7). */
  days?: number;
  today?: ISODate;
  /** Month name above the strip that also opens the calendar. */
  showMonthLabel?: boolean;
  /** Hide the calendar button (strip only). */
  hideCalendarButton?: boolean;
  /** Something on the right of the month row, e.g. a "Today" button. */
  headerAction?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

function windowFor(value: ISODate, days: number, today: ISODate, max?: ISODate) {
  const anchor = max && max < today ? max : today;
  let end: ISODate;
  if (value <= anchor && diffDays(anchor, value) < days) end = anchor;
  else end = addDaysISO(value, Math.floor(days / 2));
  if (max && end > max) end = max;
  return Array.from({ length: days }, (_, i) => addDaysISO(end, i - (days - 1)));
}

function DateStrip({
  value,
  onChange,
  min,
  max,
  days = 7,
  today = todayIST(),
  showMonthLabel = false,
  hideCalendarButton = false,
  headerAction,
  className,
  ...aria
}: DateStripProps) {
  const { t, lang } = useT();
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const stripRef = React.useRef<HTMLDivElement>(null);
  const dates = windowFor(value, days, today, max);

  const [fade, setFade] = React.useState({ start: false, end: false });
  const updateFade = React.useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const start = strip.scrollLeft > 1;
    const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
    setFade((f) => (f.start === start && f.end === end ? f : { start, end }));
  }, []);

  // Keep the chosen day visible when the strip has to scroll (narrow phones), and fade the
  // edge that has more days behind it.
  React.useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && el && strip.scrollWidth > strip.clientWidth) {
      const sr = strip.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.left < sr.left + 24) strip.scrollLeft -= sr.left + 24 - er.left;
      else if (er.right > sr.right - 24) strip.scrollLeft += er.right - (sr.right - 24);
    }
    updateFade();
  }, [value, updateFade]);

  React.useEffect(() => {
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, [updateFade]);

  const fadeClass = fade.start && fade.end ? "scroll-fade-both" : fade.start ? "scroll-fade-start" : fade.end ? "scroll-fade-end" : "";

  return (
    <div data-slot="date-strip" className={cn("flex flex-col gap-1", className)} lang={lang}>
      {(showMonthLabel || headerAction) && (
        <div className="flex min-h-9 items-center justify-between gap-2">
          {showMonthLabel ? (
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="hit-44 inline-flex h-8 min-h-8 w-fit items-center gap-1 rounded-sm px-1 text-body-sm font-semibold text-text outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {monthYearLabel(value, lang)}
              <ChevronDown className="size-4 text-text-3" aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}
          {headerAction}
        </div>
      )}
      <div className="flex items-center gap-1">
        <div
          ref={stripRef}
          role="group"
          aria-label={aria["aria-label"] ?? t("date.pickTitle")}
          onScroll={updateFade}
          className={cn("no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto px-1", fadeClass)}
        >
          {dates.map((date) => {
            const selected = date === value;
            const isToday = date === today;
            const isDisabled = Boolean((min && date < min) || (max && date > max));
            return (
              <button
                key={date}
                type="button"
                aria-pressed={selected}
                aria-current={isToday ? "date" : undefined}
                disabled={isDisabled}
                onClick={() => onChange(date)}
                className={cn(
                  "hit-44 flex h-14 min-h-14 min-w-9 flex-1 flex-col items-center justify-center rounded-md text-caption outline-none",
                  "transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:text-text-disabled",
                  selected ? "bg-primary-soft font-semibold text-primary" : "text-text-2 hover:bg-surface-2",
                )}
              >
                <span className="leading-4">{isToday ? t("date.today") : weekdayShort(date, lang)}</span>
                <span className={cn("num text-body-md font-semibold", !selected && "text-text")}>{parseISODate(date).getUTCDate()}</span>
              </button>
            );
          })}
        </div>
        {!hideCalendarButton && (
          <IconButton label={t("date.pick")} icon={<CalendarDays />} onClick={() => setCalendarOpen(true)} />
        )}
      </div>
      <CalendarSheet
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        value={value}
        min={min}
        max={max}
        today={today}
        onSelect={(date) => {
          onChange(date);
          setCalendarOpen(false);
        }}
      />
    </div>
  );
}

export type CalendarSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: ISODate | null;
  onSelect: (date: ISODate) => void;
  min?: ISODate;
  max?: ISODate;
  today?: ISODate;
  title?: React.ReactNode;
};

/** A month calendar in a bottom sheet (phones) / dialog (desktop). Picking a day closes it. */
function CalendarSheet({ open, onOpenChange, value, onSelect, min, max, today, title }: CalendarSheetProps) {
  const { t } = useT();
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title ?? t("date.pickTitle")}>
      {open && <MonthCalendar value={value} onSelect={onSelect} min={min} max={max} today={today} className="pb-2" />}
    </ResponsiveModal>
  );
}

export { DateStrip, CalendarSheet };
