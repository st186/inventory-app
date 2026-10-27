import * as React from "react";
import { CalendarDays, Check, ChevronDown, ChevronRight } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { Button } from "./button";
import { SelectChip } from "./chip";
import { MonthCalendar } from "./month-calendar";
import { ResponsiveModal } from "./responsive-modal";
import {
  RANGE_PRESETS,
  presetLabel,
  rangeForPreset,
  rangeLabel,
  shortDateLabel,
  todayIST,
  type DateRange,
  type ISODate,
  type RangePreset,
} from "./date-utils";
import { useT } from "../../utils/i18n";

// "This month ▾" chip for range-based screens (Insights, reports). Opens a sheet of presets;
// "Custom dates" swaps the same sheet to a calendar (no sheet-on-sheet). Picking a preset
// applies it straight away.
//
//   const [range, setRange] = useState(() => rangeForPreset("thisMonth"));
//   <DateRangeChip value={range} onChange={setRange} />

export type DateRangeChipProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: RangePreset[];
  min?: ISODate;
  max?: ISODate;
  today?: ISODate;
  className?: string;
};

function DateRangeChip({ value, onChange, presets = RANGE_PRESETS, min, max, today = todayIST(), className }: DateRangeChipProps) {
  const { t, lang } = useT();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<"presets" | "custom">("presets");
  const [from, setFrom] = React.useState<ISODate>(value.from);
  const [to, setTo] = React.useState<ISODate | null>(value.to);
  const [picking, setPicking] = React.useState<"from" | "to">("from");

  const openSheet = () => {
    setView("presets");
    setFrom(value.from);
    setTo(value.to);
    setPicking("from");
    setOpen(true);
  };

  const pickPreset = (preset: RangePreset) => {
    if (preset === "custom") {
      setView("custom");
      return;
    }
    onChange(rangeForPreset(preset, today));
    setOpen(false);
  };

  const pickDay = (date: ISODate) => {
    if (picking === "from") {
      setFrom(date);
      setTo(null);
      setPicking("to");
    } else {
      if (date < from) {
        setTo(from);
        setFrom(date);
      } else setTo(date);
      setPicking("from");
    }
  };

  const fieldButton = (which: "from" | "to", date: ISODate | null) => (
    <button
      type="button"
      onClick={() => setPicking(which)}
      aria-pressed={picking === which}
      className={cn(
        "flex min-h-13 flex-1 flex-col items-start justify-center rounded-md border px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        picking === which ? "border-primary bg-primary-soft" : "border-border-strong bg-surface",
      )}
    >
      <span className="text-caption text-text-3">{which === "from" ? t("date.from") : t("date.to")}</span>
      <span className="num text-body-md font-semibold text-text">{date ? shortDateLabel(date, lang, today) : "–"}</span>
    </button>
  );

  return (
    <>
      <SelectChip
        className={className}
        onClick={openSheet}
        leadingIcon={<CalendarDays aria-hidden="true" />}
        trailingIcon={<ChevronDown aria-hidden="true" />}
        aria-haspopup="dialog"
      >
        {rangeLabel(value, lang, today)}
      </SelectChip>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={view === "custom" ? t("date.custom") : t("date.rangeTitle")}
        onBack={view === "custom" ? () => setView("presets") : undefined}
        footer={
          view === "custom" ? (
            <Button
              size="lg"
              className="flex-1"
              disabled={!to}
              onClick={() => {
                if (!to) return;
                onChange({ preset: "custom", from, to });
                setOpen(false);
              }}
            >
              {t("common.apply")}
            </Button>
          ) : undefined
        }
      >
        {view === "presets" ? (
          <div role="radiogroup" aria-label={t("date.rangeTitle")} className="-mx-1 flex flex-col overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
            {presets.map((preset) => {
              const selected = value.preset === preset;
              const range = preset === "custom" ? null : rangeForPreset(preset, today);
              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pickPreset(preset)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-surface-2/60 active:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("text-body-md text-text", selected ? "font-semibold" : "font-medium")}>{presetLabel(preset, lang)}</span>
                    {range && <span className="num text-label text-text-3">{rangeLabel({ ...range, preset: "custom" }, lang, today)}</span>}
                  </span>
                  {preset === "custom" ? (
                    <ChevronRight className="size-5 text-text-disabled" aria-hidden="true" />
                  ) : selected ? (
                    <Check className="size-5 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {fieldButton("from", from)}
              {fieldButton("to", to)}
            </div>
            <MonthCalendar
              value={picking === "from" ? from : to}
              rangeFrom={from}
              rangeTo={to}
              onSelect={pickDay}
              min={min}
              max={max ?? today}
              today={today}
              defaultMonth={value.to}
            />
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}

export { DateRangeChip };
export { rangeForPreset, type DateRange, type RangePreset } from "./date-utils";
