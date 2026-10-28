import { memo } from 'react';
import { getTodayIST } from '../utils/timezone';
import { DateStrip } from './ui/date-strip';
import { Button } from './ui/button';
import { useT } from '../utils/i18n';

type Props = {
  selectedDate: string;
  onDateChange: (date: string) => void;
};

// Day picker for the Sales and Expense screens: a 7-day strip (today at the end, the chosen day
// highlighted) with a calendar button and month label for any other date. Same props as
// before; the native date input and the Prev/Next week buttons are replaced by the strip and
// the calendar sheet.
export const DateSelector = memo(function DateSelector({ selectedDate, onDateChange }: Props) {
  const { t } = useT();
  const today = getTodayIST();

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface px-1 pt-1 pb-2 sm:px-3">
      <DateStrip
        value={selectedDate}
        onChange={onDateChange}
        today={today}
        showMonthLabel
        headerAction={
          selectedDate !== today ? (
            <Button variant="ghost" size="sm" onClick={() => onDateChange(today)}>
              {t('date.today')}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
});
