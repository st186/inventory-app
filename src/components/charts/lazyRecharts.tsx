import { useEffect, useState, type ReactNode } from 'react';
import type * as Recharts from 'recharts';

// recharts is ~430 KB of code. Screens that open with numbers first (the Analytics overview)
// import the chart parts from here instead of from 'recharts', and wrap each chart in
// <LazyChart height={...}>{() => (<ResponsiveContainer ...>...</ResponsiveContainer>)}</LazyChart>.
// The page paints its cards straight away, each chart keeps its space with a same-size
// placeholder, and the library loads once in the background.
//
// The names below are live bindings, filled in when recharts arrives - they are undefined
// until then, so only touch them inside a LazyChart render function (which runs only once the
// library is ready). Building chart elements outside it would capture the undefined values.

type R = typeof Recharts;

export let ResponsiveContainer: R['ResponsiveContainer'];
export let BarChart: R['BarChart'];
export let Bar: R['Bar'];
export let LineChart: R['LineChart'];
export let Line: R['Line'];
export let AreaChart: R['AreaChart'];
export let Area: R['Area'];
export let ComposedChart: R['ComposedChart'];
export let PieChart: R['PieChart'];
export let Pie: R['Pie'];
export let Cell: R['Cell'];
export let XAxis: R['XAxis'];
export let YAxis: R['YAxis'];
export let CartesianGrid: R['CartesianGrid'];
export let Tooltip: R['Tooltip'];
export let Legend: R['Legend'];
export let ReferenceLine: R['ReferenceLine'];

let ready = false;
let loading: Promise<void> | null = null;

export function loadRecharts(): Promise<void> {
  if (!loading) {
    loading = import('./rechartsParts').then((m) => {
      ResponsiveContainer = m.ResponsiveContainer;
      BarChart = m.BarChart;
      Bar = m.Bar;
      LineChart = m.LineChart;
      Line = m.Line;
      AreaChart = m.AreaChart;
      Area = m.Area;
      ComposedChart = m.ComposedChart;
      PieChart = m.PieChart;
      Pie = m.Pie;
      Cell = m.Cell;
      XAxis = m.XAxis;
      YAxis = m.YAxis;
      CartesianGrid = m.CartesianGrid;
      Tooltip = m.Tooltip;
      Legend = m.Legend;
      ReferenceLine = m.ReferenceLine;
      ready = true;
    });
    // A failed load (e.g. a stale web deploy) lets the next chart try again.
    loading.catch(() => { loading = null; });
  }
  return loading;
}

// Start the load when the browser is idle (or soon after the first paint), so reading and
// compiling the library doesn't compete with the page's first frame.
let scheduled: Promise<void> | null = null;
function loadWhenIdle(): Promise<void> {
  if (!scheduled) {
    scheduled = new Promise<void>((resolve) => {
      const go = () => resolve();
      const ric = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
      if (ric) ric(go, { timeout: 800 });
      else setTimeout(go, 150);
    }).then(loadRecharts);
    scheduled.catch(() => { scheduled = null; });
  }
  return scheduled;
}

export function LazyChart({ height, children }: { height: number | string; children: () => ReactNode }) {
  const [isReady, setIsReady] = useState(ready);
  useEffect(() => {
    if (isReady) return;
    let alive = true;
    loadWhenIdle().then(() => { if (alive) setIsReady(true); }, () => { /* placeholder stays */ });
    return () => { alive = false; };
  }, [isReady]);
  if (!isReady) return <div className="w-full rounded-lg bg-gray-50 animate-pulse" style={{ height }} aria-hidden="true" />;
  return <>{children()}</>;
}
