"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries, CandlestickSeries, ColorType, CrosshairMode, LineStyle, createChart,
  type IChartApi, type ISeriesApi, type MouseEventParams, type Time, type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "../../lib/api";

export type Hover = { t: number; c: string; o: string; h: string; l: string } | null;

/** Usd6 digit string → dollars as a float. Drawing only (D5 money rules don't apply to pixels). */
const px = (usd6: string) => Number(usd6) / 1e6;
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function palette() {
  return {
    ink: css("--muted") || "#56665D", line: css("--line") || "#E1E8E3", primary: css("--primary") || "#0F7B4F",
    good: css("--good") || "#0F7B4F", bad: css("--bad") || "#B4342B", surface: css("--surface") || "#FFFFFF",
  };
}

function precisionFor(candles: Candle[]): number {
  const last = candles[candles.length - 1];
  if (!last) return 2;
  const v = px(last.c);
  return v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
}

/**
 * TradingView lightweight-charts (Apache-2.0; attribution logo stays on). Area by default, candles on request.
 * Re-reads the theme tokens when the theme changes, so it is never light-on-light.
 */
export default function PriceChartImpl({ candles, kind, onHover, height }: { candles: Candle[]; kind: "area" | "candles"; onHover: (h: Hover) => void; height: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | null>(null);
  const hover = useRef(onHover); hover.current = onHover;
  const byTime = useRef(new Map<number, Candle>());

  // Create once; rebuild the series when the kind changes.
  useEffect(() => {
    if (!el.current) return;
    const c = palette();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ch = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: c.ink, fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif", attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: c.line, style: LineStyle.Solid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: c.ink, style: LineStyle.Dashed, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
      handleScale: false,
      handleScroll: false,
      kineticScroll: { touch: !reduce, mouse: false },
    });
    chart.current = ch;
    const move = (p: MouseEventParams<Time>) => {
      const t = typeof p.time === "number" ? p.time : null;
      const k = t != null ? byTime.current.get(t) : undefined;
      hover.current(k ? { t: k.t, c: k.c, o: k.o, h: k.h, l: k.l } : null);
    };
    ch.subscribeCrosshairMove(move);
    const retheme = () => {
      const p = palette();
      ch.applyOptions({ layout: { textColor: p.ink }, grid: { horzLines: { color: p.line } }, crosshair: { vertLine: { color: p.ink } } });
      const s = series.current;
      if (s && s.seriesType() === "Area") (s as ISeriesApi<"Area">).applyOptions({ lineColor: p.primary, topColor: `${p.primary}38`, bottomColor: `${p.primary}00` });
      if (s && s.seriesType() === "Candlestick") (s as ISeriesApi<"Candlestick">).applyOptions({ upColor: p.good, downColor: p.bad, wickUpColor: p.good, wickDownColor: p.bad });
    };
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", retheme);
    return () => { mo.disconnect(); mq.removeEventListener("change", retheme); ch.unsubscribeCrosshairMove(move); ch.remove(); chart.current = null; series.current = null; };
  }, []);

  useEffect(() => {
    const ch = chart.current; if (!ch) return;
    if (series.current) { ch.removeSeries(series.current); series.current = null; }
    const p = palette();
    series.current = kind === "area"
      ? ch.addSeries(AreaSeries, { lineColor: p.primary, topColor: `${p.primary}38`, bottomColor: `${p.primary}00`, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4 })
      : ch.addSeries(CandlestickSeries, { upColor: p.good, downColor: p.bad, wickUpColor: p.good, wickDownColor: p.bad, borderVisible: false, priceLineVisible: false, lastValueVisible: false });
  }, [kind]);

  useEffect(() => {
    const s = series.current; const ch = chart.current; if (!s || !ch) return;
    const prec = precisionFor(candles);
    s.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: 1 / 10 ** prec } });
    byTime.current = new Map(candles.map(k => [k.t, k]));
    if (s.seriesType() === "Area") (s as ISeriesApi<"Area">).setData(candles.map(k => ({ time: k.t as UTCTimestamp, value: px(k.c) })));
    else (s as ISeriesApi<"Candlestick">).setData(candles.map(k => ({ time: k.t as UTCTimestamp, open: px(k.o), high: px(k.h), low: px(k.l), close: px(k.c) })));
    ch.timeScale().fitContent();
  }, [candles, kind]);

  return <div ref={el} className="price-chart" style={{ height }} onPointerLeave={() => hover.current(null)} />;
}
