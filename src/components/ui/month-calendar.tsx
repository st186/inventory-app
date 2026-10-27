import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { IconButton } from "./icon-button";
import {
  addDaysISO,
  addMonthsISO,
  dayOfWeek,
  endOfMonthISO,
  monthYearLabel,
  parseISODate,
  startOfMonthISO,
  todayIST,
  type ISODate,
} from "./date-utils";
import { useT } from "../../utils/i18n";

// A month grid with 44 px day cells (no date library). Today has a ring, the chosen day is
// filled primary, days outside min/max are disabled. Keyboard: arrows move a day/week,
// PageUp/PageDown a month, Home/End the week, Enter picks.

export type MonthCalendarProps = {
  value?: ISODate | null;
  onSelect: (date: ISODate) => void;
  min?: ISODate;
  max?: ISODate;
  /** Month shown first (defaults to the value's month, else today's). */
  defaultMonth?: ISODate;
  /** Highlight a range (date-range picker). */
  rangeFrom?: ISODate | null;
  rangeTo?: ISODate | null;
  today?: ISODate;
  className?: string;
};

function MonthCalendar({ value, onSelect, min, max, defaultMonth, rangeFrom, rangeTo, today = todayIST(), className }: MonthCalendarProps) {
  const { t, lang } = useT();
  const [month, setMonth] = React.useState(() => startOfMonthISO(defaultMonth ?? value ?? today));
  const [focusDate, setFocusDate] = React.useState<ISODate>(() => value ?? today);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const focusOnRender = React.useRef(false);

  React.useEffect(() => {
    if (!focusOnRender.current) return;
    focusOnRender.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, month]);

  const first = startOfMonthISO(month);
  const leading = (dayOfWeek(first) + 6) % 7; // weeks start on Monday
  const daysInMonth = parseISODate(endOfMonthISO(month)).getUTCDate();
  const cells: (ISODate | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDaysISO(first, i)),
  ];
  while (cells.length % 7) cells.push(null);

  const disabled = (d: ISODate) => Boolean((min && d < min) || (max && d > max));
  const canPrev = !min || endOfMonthISO(addMonthsISO(month, -1)) >= min;
  const canNext = !max || startOfMonthISO(addMonthsISO(month, 1)) <= max;

  const moveFocus = (next: ISODate) => {
    focusOnRender.current = true;
    setFocusDate(next);
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(startOfMonthISO(next));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, date: ISODate) => {
    const map: Record<string, () => ISODate> = {
      ArrowLeft: () => addDaysISO(date, -1),
      ArrowRight: () => addDaysISO(date, 1),
      ArrowUp: () => addDaysISO(date, -7),
      ArrowDown: () => addDaysISO(date, 7),
      PageUp: () => addMonthsISO(date, -1),
      PageDown: () => addMonthsISO(date, 1),
      Home: () => addDaysISO(date, -((dayOfWeek(date) + 6) % 7)),
      End: () => addDaysISO(date, 6 - ((dayOfWeek(date) + 6) % 7)),
    };
    const fn = map[event.key];
    if (fn) {
      event.preventDefault();
      moveFocus(fn());
    }
  };

  // Mon..Sun headers
  const headers = [1, 2, 3, 4, 5, 6, 0].map((wd) => t(`date.wd.${wd}` as never));
  const focusInMonth = focusDate.slice(0, 7) === month.slice(0, 7) ? focusDate : first;

  return (
    <div data-slot="month-calendar" className={cn("flex flex-col gap-2", className)} lang={lang}>
      <div className="flex items-center gap-1">
        <IconButton
          label={t("date.prevMonth")}
          icon={<ChevronLeft />}
          disabled={!canPrev}
          onClick={() => setMonth(addMonthsISO(month, -1))}
        />
        <div className="flex-1 text-center text-subtitle font-semibold text-text" aria-live="polite">
          {monthYearLabel(month, lang)}
        </div>
        <IconButton
          label={t("date.nextMonth")}
          icon={<ChevronRight />}
          disabled={!canNext}
          onClick={() => setMonth(addMonthsISO(month, 1))}
        />
      </div>
      <div role="grid" aria-label={monthYearLabel(month, lang)} ref={gridRef} className="flex flex-col gap-1">
        <div role="row" className="grid grid-cols-7 gap-1">
          {headers.map((h, i) => (
            <span key={i} role="columnheader" className="flex h-8 items-center justify-center text-caption font-medium text-text-3">
              {h}
            </span>
          ))}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div role="row" key={row} className="grid grid-cols-7 gap-1">
            {cells.slice(row * 7, row * 7 + 7).map((date, col) => {
              if (!date) return <span key={col} role="gridcell" aria-hidden="true" />;
              const isSelected = date === value;
              const isToday = date === today;
              const inRange = Boolean(rangeFrom && rangeTo && date >= rangeFrom && date <= rangeTo);
              const isDisabled = disabled(date);
              return (
                <span key={col} role="gridcell" aria-selected={isSelected || inRange || undefined}>
                  <button
                    type="button"
                    data-date={date}
                    tabIndex={date === focusInMonth ? 0 : -1}
                    disabled={isDisabled}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${parseISODate(date).getUTCDate()} ${monthYearLabel(date, lang)}`}
                    onClick={() => onSelect(date)}
                    onKeyDown={(e) => onKeyDown(e, date)}
                    onFocus={() => setFocusDate(date)}
                    className={cn(
                      "num flex h-11 min-h-11 w-full min-w-0 items-center justify-center rounded-md text-body-sm font-medium outline-none transition-colors duration-(--dur-fast)",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:text-text-disabled",
                      isSelected
                        ? "bg-primary font-semibold text-on-primary"
                        : inRange
                          ? "bg-primary-soft text-primary"
                          : "text-text hover:bg-surface-2",
                      isToday && !isSelected && "ring-1 ring-inset ring-primary text-primary",
                    )}
                  >
                    {parseISODate(date).getUTCDate()}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export { MonthCalendar };
