// charts.jsx — the quantitative layer, PORTED from v1 src/data.jsx per the §8 manifest
// (TVChart wholesale: crosshair tip, ResizeObserver, setRange, v5 API, flow→BaselineSeries;
// BuildingState; fmt helpers incl. the KRW-B formatter). Edits: theme tokens + the §4
// range-preset chips (1M·3M·6M·1Y·5Y·All on EVERY chart) + the flow zero line — nothing else.
import React, { useEffect, useRef, useState } from 'react';
import { createChart, AreaSeries, BaselineSeries, LineSeries, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';

export function fmt(v, unit) {
  if (v == null || Number.isNaN(v)) return '—';
  if (unit === '$M') return v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${Math.round(v)}M`;
  if (unit === '$k') return `$${(v / 1e6).toFixed(1)}B`; // $ thousands → billions
  if (unit === 'USD') return `$${v.toFixed(2)}`;
  if (unit === 'pct') return `${v >= 0 ? '' : ''}${v.toFixed(1)}%`; // operating/gross margin — can be negative (cycle troughs)
  if (unit === 'KRW-B') { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1000 ? `${s}₩${(a / 1000).toFixed(2)}T` : `${s}₩${Math.round(a)}B`; }
  if (unit === 'KRW') return `₩${Math.round(v).toLocaleString()}`;
  if (unit === '×') return `${v.toFixed(1)}×`;
  return v.toFixed(1);
}
export function fmtTime(t) {
  if (t == null) return '';
  if (typeof t === 'object' && t.year) return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  if (typeof t === 'number') return new Date(t * 1000).toISOString().slice(0, 10);
  return String(t);
}
export const chgCol = (v) => (v == null ? 'var(--sec-2)' : v > 0 ? 'var(--intact)' : v < 0 ? 'var(--fired)' : 'var(--sec-2)');
export const arrow = (v) => (v == null ? '' : v > 0 ? '▲' : v < 0 ? '▼' : '▪');

const RANGES = [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['5Y', 60], ['All', null]];

export function TVChart({ data, unit, kind, height = 210 }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [tip, setTip] = useState(null);
  const [active, setActive] = useState('All');

  useEffect(() => {
    const el = wrapRef.current;
    const chart = createChart(el, {
      width: el.clientWidth || 320, height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7C8698', fontSize: 11,
        fontFamily: '"JetBrains Mono Variable", monospace', attributionLogo: false },
      grid: { vertLines: { color: '#1B212C' }, horzLines: { color: '#1B212C' } },
      rightPriceScale: { borderColor: '#232937' },
      timeScale: { borderColor: '#232937', timeVisible: false, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet,
        vertLine: { color: '#2E374A', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E2430' },
        horzLine: { color: '#2E374A', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E2430' } },
      localization: { priceFormatter: (v) => fmt(v, unit) },
    });
    // the last-value pill crowds the axis on compact tiles (and the big stat is printed
    // above them anyway) — keep it only on full-size charts
    const showLast = height >= 120;
    const series = kind === 'flow'
      ? chart.addSeries(BaselineSeries, {
          baseValue: { type: 'price', price: 0 }, // green above 0 (retail buying), red below (selling)
          topLineColor: '#46C482', topFillColor1: 'rgba(70,196,130,0.28)', topFillColor2: 'rgba(70,196,130,0.02)',
          bottomLineColor: '#EF7480', bottomFillColor1: 'rgba(239,116,128,0.02)', bottomFillColor2: 'rgba(239,116,128,0.28)',
          lineWidth: 2, priceLineVisible: false, lastValueVisible: showLast,
        })
      : chart.addSeries(AreaSeries, {
          lineColor: '#7B87E8', topColor: 'rgba(123,135,232,0.16)', bottomColor: 'rgba(123,135,232,0)',
          lineWidth: 2, priceLineVisible: false, lastValueVisible: showLast,
        });
    if (kind === 'flow') series.createPriceLine({ price: 0, color: '#3A4149', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false });
    series.setData(data.map((d) => ({ time: d.date, value: d.value })));
    chart.timeScale().fitContent();
    chartRef.current = { chart, series };
    chart.subscribeCrosshairMove((param) => {
      const bar = param.seriesData?.get(series);
      if (!param.time || !param.point || param.point.x < 0 || bar == null) { setTip(null); return; }
      setTip({ x: param.point.x, date: fmtTime(param.time), value: fmt(bar.value ?? bar, unit) });
    });
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [data, unit, kind, height]);

  const setRange = (lbl, months) => {
    setActive(lbl);
    const c = chartRef.current; const d = dataRef.current;
    if (!c || !d.length) return;
    try {
      if (months == null) { c.chart.timeScale().fitContent(); return; }
      const to = d[d.length - 1].date;
      const f = new Date(to); f.setMonth(f.getMonth() - months);
      c.chart.timeScale().setVisibleRange({ from: f.toISOString().slice(0, 10), to });
    } catch { c.chart.timeScale().fitContent(); }
  };

  return (
    <div>
      <div className="chart-wrap">
        <div ref={wrapRef} style={{ width: '100%', height }} />
        {tip && (
          <div className="chart-tip" style={{ left: Math.max(4, Math.min(tip.x + 10, (wrapRef.current?.clientWidth || 320) - 130)) }}>
            <span style={{ color: 'var(--text)' }}>{tip.value}</span>
            <span className="dimmer" style={{ fontSize: 10 }}> · {tip.date}</span>
          </div>
        )}
      </div>
      <div className="range-btns rangechips">
        {RANGES.map(([lbl, m]) => (
          <button key={lbl} className={`rc${active === lbl ? ' on' : ''}`} onClick={() => setRange(lbl, m)}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

// below this many points a line chart is just a flat stub — show the readings list instead
// ("no free spot history exists; it fills in going forward" — §12)
export const MIN_CHART_POINTS = 7;

export function BuildingState({ data, unit }) {
  const n = data.length;
  return (
    <div className="readingsC">
      <div className="note">
        BUILDING — <span className="mono">{n}</span> reading{n === 1 ? '' : 's'} so far. A trend chart engages
        at ~{MIN_CHART_POINTS}; there's no free history to backfill, so it accrues one point per sync session.
      </div>
      {data.slice(-8).map((d) => (
        <div className="row" key={d.date}>
          <span className="dimmer">{d.date}</span>
          <span>
            <span style={{ color: 'var(--text)' }}>{fmt(d.value, unit)}</span>
            {d.chg != null && <span style={{ color: chgCol(d.chg), marginLeft: 10, fontSize: 10 }}>{arrow(d.chg)} {d.chg >= 0 ? '+' : ''}{d.chg.toFixed(2)}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// MULTI-LINE overlay — N series on one time axis (margin comparison: official solid vs estimated
// dashed). Legend tracks the crosshair (falls back to last values). A dotted zero line anchors the
// negative cycle-trough margins. series: [{ label, data:[{date,value}], color, dashed, grade }].
export function MultiLineChart({ series, height = 230, unit = 'pct' }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const [active, setActive] = useState('All');
  const [hover, setHover] = useState(null); // { date, byLabel: {label: formattedValue} }

  useEffect(() => {
    const el = wrapRef.current;
    const chart = createChart(el, {
      width: el.clientWidth || 320, height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7C8698', fontSize: 11,
        fontFamily: '"JetBrains Mono Variable", monospace', attributionLogo: false },
      grid: { vertLines: { color: '#1B212C' }, horzLines: { color: '#1B212C' } },
      rightPriceScale: { borderColor: '#232937' },
      timeScale: { borderColor: '#232937', timeVisible: false, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet,
        vertLine: { color: '#2E374A', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E2430' },
        horzLine: { color: '#2E374A', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E2430' } },
      localization: { priceFormatter: (v) => fmt(v, unit) },
    });
    const handles = (series || []).filter((s) => s.data?.length).map((s) => {
      const ls = chart.addSeries(LineSeries, {
        color: s.color, lineWidth: 2, lineStyle: s.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3,
      });
      ls.setData(s.data.map((d) => ({ time: d.date, value: d.value })));
      return { s, ls };
    });
    if (handles.length) handles[0].ls.createPriceLine({ price: 0, color: '#3A4149', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
    chart.timeScale().fitContent();
    chartRef.current = { chart, handles };
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || param.point.x < 0) { setHover(null); return; }
      const byLabel = {};
      for (const { s, ls } of handles) { const bar = param.seriesData?.get(ls); if (bar != null) byLabel[s.label] = fmt(bar.value ?? bar, unit); }
      setHover({ date: fmtTime(param.time), byLabel });
    });
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [series, height, unit]);

  const setRange = (lbl, months) => {
    setActive(lbl);
    const c = chartRef.current; if (!c) return;
    const all = (seriesRef.current || []).flatMap((s) => s.data || []).map((d) => d.date).sort();
    if (!all.length) return;
    try {
      if (months == null) { c.chart.timeScale().fitContent(); return; }
      const to = all[all.length - 1];
      const f = new Date(to); f.setMonth(f.getMonth() - months);
      c.chart.timeScale().setVisibleRange({ from: f.toISOString().slice(0, 10), to });
    } catch { c.chart.timeScale().fitContent(); }
  };

  const lastOf = (s) => (s.data?.length ? fmt(s.data[s.data.length - 1].value, unit) : '—');
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '2px 4px 8px' }}>
        {(series || []).map((s) => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 16, height: 0, borderTop: `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}`, display: 'inline-block' }} />
            <span style={{ color: 'var(--sec-2)' }}>{s.label}</span>
            {s.grade && <span style={{ fontSize: 8.5, color: 'var(--dim)', letterSpacing: 0.3 }}>[{s.grade}]</span>}
            <b style={{ color: 'var(--text)' }}>{hover?.byLabel[s.label] ?? lastOf(s)}</b>
          </span>
        ))}
        {hover?.date && <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 'auto' }}>{hover.date}</span>}
      </div>
      <div className="chart-wrap"><div ref={wrapRef} style={{ width: '100%', height }} /></div>
      <div className="range-btns rangechips">
        {RANGES.map(([lbl, m]) => (
          <button key={lbl} className={`rc${active === lbl ? ' on' : ''}`} onClick={() => setRange(lbl, m)}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

// one series tile body: empty → building → live chart
export function SeriesBody({ meta, data, height = 150 }) {
  if (!meta?.available || !data) {
    return <div className="emptyD">No data yet — run <span className="mono">node cockpit/sync.js</span> (or open the site after 20h; it self-freshens).</div>;
  }
  if (data.length < MIN_CHART_POINTS) return <BuildingState data={data} unit={meta.unit} />;
  return <TVChart data={data} unit={meta.unit} kind={meta.kind} height={height} />;
}
