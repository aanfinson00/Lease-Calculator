"use client";

import {
  Document,
  Page,
  StyleSheet,
  Svg,
  Rect,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ScenarioResults, WaterfallComponents } from "@/lib/types";
import { fmtCurrency, fmtPercent, fmtPSF } from "@/lib/format";

// ---------------------------------------------------------------------------
// Styles (react-pdf uses a flexbox-ish subset; values are points)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    paddingBottom: 8,
    marginBottom: 14,
  },
  headerLeft: { flexDirection: "column" },
  headerRight: { flexDirection: "column", alignItems: "flex-end" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#475569" },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#475569",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  table: { borderTopWidth: 0.5, borderColor: "#cbd5e1" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#e2e8f0",
    paddingVertical: 4,
  },
  rowHeader: {
    flexDirection: "row",
    paddingVertical: 4,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
  },
  cellLabel: { flex: 1.6, paddingHorizontal: 4 },
  cellNum: { flex: 1, paddingHorizontal: 4, textAlign: "right" },
  cellMuted: { color: "#475569" },
  bold: { fontFamily: "Helvetica-Bold" },
  positive: { color: "#047857" },
  negative: { color: "#b91c1c" },

  twoCol: { flexDirection: "row", gap: 12 },
  card: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    padding: 8,
  },
  cardTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    color: "#0f172a",
  },
  small: { fontSize: 7, color: "#64748b" },
});

// ---------------------------------------------------------------------------
// Hand-drawn waterfall (SVG <Rect>s — react-pdf has no charting library)
// ---------------------------------------------------------------------------

interface WaterfallProps {
  title: string;
  waterfall: WaterfallComponents;
}

function PdfWaterfall({ title, waterfall }: WaterfallProps) {
  const items = [
    { name: "Base", base: 0, value: waterfall.baseRent, color: "#1e293b" },
    {
      name: "Free",
      base: waterfall.baseRent + waterfall.freeRent,
      value: -waterfall.freeRent,
      color: "#dc2626",
    },
    {
      name: "TI",
      base: waterfall.baseRent + waterfall.freeRent + waterfall.ti,
      value: -waterfall.ti,
      color: "#dc2626",
    },
    {
      name: "LC",
      base: waterfall.baseRent + waterfall.freeRent + waterfall.ti + waterfall.lc,
      value: -waterfall.lc,
      color: "#dc2626",
    },
    { name: "Net CF", base: 0, value: waterfall.netCashFlow, color: "#059669" },
  ];

  // Chart geometry
  const W = 240;
  const H = 110;
  const padX = 18;
  const padY = 12;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const max = Math.max(...items.map((it) => it.base + it.value), 1);
  const barW = innerW / items.length - 6;
  const yFor = (v: number) => padY + innerH - (v / max) * innerH;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Svg width={W} height={H}>
        {/* baseline */}
        <Rect x={padX} y={padY + innerH} width={innerW} height={0.5} fill="#94a3b8" />
        {items.map((it, i) => {
          const x = padX + i * (innerW / items.length) + 3;
          const top = yFor(it.base + it.value);
          const bottom = yFor(it.base);
          return (
            <Rect
              key={it.name}
              x={x}
              y={top}
              width={barW}
              height={Math.max(1, bottom - top)}
              fill={it.color}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 4 }}>
        {items.map((it) => (
          <View key={it.name} style={{ alignItems: "center", flex: 1 }}>
            <Text style={styles.small}>{it.name}</Text>
            <Text style={[styles.small, { color: "#0f172a" }]}>
              {fmtCurrency(it.value, 1)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

interface DocProps {
  propertyName: string;
  aName: string;
  aResults: ScenarioResults;
  bName: string;
  bResults: ScenarioResults;
}

const fmtSigned = (v: number, fractionDigits = 2): string => {
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "" : "";
  return `${sign}${fmtCurrency(v, fractionDigits)}`;
};

export function ComparisonDoc({
  propertyName,
  aName,
  aResults,
  bName,
  bResults,
}: DocProps) {
  const headlineRows = [
    {
      label: "Undiscounted NER",
      a: aResults.undiscountedNER,
      b: bResults.undiscountedNER,
      fmt: (v: number) => fmtPSF(v, 2),
      delta: bResults.undiscountedNER - aResults.undiscountedNER,
    },
    {
      label: "Discounted NER",
      a: aResults.discountedNER,
      b: bResults.discountedNER,
      fmt: (v: number) => fmtPSF(v, 2),
      delta: bResults.discountedNER - aResults.discountedNER,
    },
    {
      label: "Yield on Cost (Yr 1)",
      a: aResults.yocYr1,
      b: bResults.yocYr1,
      fmt: (v: number) => fmtPercent(v, 2),
      delta: bResults.yocYr1 - aResults.yocYr1,
    },
    {
      label: "Yield on Cost (Term)",
      a: aResults.yocTerm,
      b: bResults.yocTerm,
      fmt: (v: number) => fmtPercent(v, 2),
      delta: bResults.yocTerm - aResults.yocTerm,
    },
    {
      label: "Total Basis ($/SF)",
      a: aResults.totalBasisPSF,
      b: bResults.totalBasisPSF,
      fmt: (v: number) => fmtPSF(v, 2),
      delta: bResults.totalBasisPSF - aResults.totalBasisPSF,
    },
  ];

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const maxYears = Math.max(aResults.schedule.length, bResults.schedule.length);

  return (
    <Document title={`${propertyName || "RFP"} Comparison`} author="RFP Analyzer">
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{propertyName || "RFP Comparison"}</Text>
            <Text style={styles.subtitle}>NER comparison · industrial lease analysis</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.subtitle}>{today}</Text>
            <Text style={styles.subtitle}>
              {aName}  vs  {bName}
            </Text>
          </View>
        </View>

        {/* Headline metrics */}
        <Text style={styles.sectionTitle}>Headline metrics</Text>
        <View style={styles.table}>
          <View style={styles.rowHeader}>
            <Text style={[styles.cellLabel, styles.bold]}>Metric</Text>
            <Text style={[styles.cellNum, styles.bold]}>{aName}</Text>
            <Text style={[styles.cellNum, styles.bold]}>{bName}</Text>
            <Text style={[styles.cellNum, styles.bold]}>Δ (B − A)</Text>
          </View>
          {headlineRows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.cellLabel}>{r.label}</Text>
              <Text style={styles.cellNum}>{r.fmt(r.a)}</Text>
              <Text style={[styles.cellNum, styles.bold]}>{r.fmt(r.b)}</Text>
              <Text
                style={[
                  styles.cellNum,
                  r.delta > 0 ? styles.positive : r.delta < 0 ? styles.negative : {},
                ]}
              >
                {r.label.includes("Yield") ? fmtPercent(r.delta, 2) : fmtSigned(r.delta, 2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Waterfalls */}
        <Text style={styles.sectionTitle}>NER waterfall (PSF over term)</Text>
        <View style={styles.twoCol}>
          <PdfWaterfall title={aName} waterfall={aResults.waterfall} />
          <PdfWaterfall title={bName} waterfall={bResults.waterfall} />
        </View>

        {/* Annual schedule (compact) */}
        <Text style={styles.sectionTitle}>Annual rent schedule</Text>
        <View style={styles.table}>
          <View style={styles.rowHeader}>
            <Text style={[styles.cellLabel, styles.bold]}>Year</Text>
            <Text style={[styles.cellNum, styles.bold]}>{aName} Rate</Text>
            <Text style={[styles.cellNum, styles.bold]}>{aName} Mo</Text>
            <Text style={[styles.cellNum, styles.bold]}>{bName} Rate</Text>
            <Text style={[styles.cellNum, styles.bold]}>{bName} Mo</Text>
          </View>
          {Array.from({ length: maxYears }).map((_, i) => {
            const aRow = aResults.schedule[i];
            const bRow = bResults.schedule[i];
            const yearLabel =
              (aRow ?? bRow)?.year === 0 ? "Free Rent" : `Year ${(aRow ?? bRow)?.year}`;
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.cellLabel}>{yearLabel}</Text>
                <Text style={styles.cellNum}>
                  {aRow ? fmtCurrency(aRow.annualRatePSF, 2) : "—"}
                </Text>
                <Text style={[styles.cellNum, styles.cellMuted]}>
                  {aRow ? aRow.monthsActive : "—"}
                </Text>
                <Text style={styles.cellNum}>
                  {bRow ? fmtCurrency(bRow.annualRatePSF, 2) : "—"}
                </Text>
                <Text style={[styles.cellNum, styles.cellMuted]}>
                  {bRow ? bRow.monthsActive : "—"}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View
          style={{
            position: "absolute",
            bottom: 16,
            left: 36,
            right: 36,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
          fixed
        >
          <Text style={styles.small}>{propertyName || "RFP Analysis"}</Text>
          <Text
            style={styles.small}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
