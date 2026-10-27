// Dev-only (stock-preview.html): moves the clock to ?today=YYYY-MM-DD (default 6 Nov 2026, after
// the Phase 1 go-live) so the whole-bag and receive-and-count screens show. Imported first.
const wanted = new URLSearchParams(window.location.search).get('today') || '2026-11-06';
const RealDate = Date;
const target = new RealDate(`${wanted}T10:15:00+05:30`).getTime();
const offset = Number.isNaN(target) ? 0 : target - RealDate.now();

class ShiftedDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as [any]));
  }
  static now() {
    return RealDate.now() + offset;
  }
}
(globalThis as any).Date = ShiftedDate;

export {};
