import { useMemo, useState } from "react";
import Papa from "papaparse";
import "./App.css";
import { SECTIONS } from "./sections";


type Row = Record<string, string>;
type ResultType = "LOW" | "GOOD" | "HIGH";
type ComputedRow = {
  position: string;
  hands?: string;
  value: number;
  target: { min: number; max: number };
  result: ResultType;
  recAction: string;
};

function parsePercent(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "-" || s.toLowerCase() === "na") return null;
  const cleaned = s.replace("%", "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function classify(value: number, range: { min: number; max: number }): ResultType {
  if (value <= range.min) return "LOW";
  if (value >= range.max) return "HIGH";
  return "GOOD";
}


function badgeStyle(result: ResultType): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5,
  };
  if (result === "GOOD") return { ...base, background: "#103d2b", color: "#6dffb6" };
  if (result === "LOW") return { ...base, background: "#3c3410", color: "#ffd76d" };
  return { ...base, background: "#3d1010", color: "#ff6d6d" };
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.18)",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    padding: "7px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  };
}

function smallBtnStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: "7px 10px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  };
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export default function App() {
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string>("");

  const [globalRowFilter] = useState<"ALL" | "GOOD" | "BAD">("ALL");
  const [sectionScope] = useState<"ALL" | "WITH_BAD" | "WITH_DATA">("ALL");
  const [query] = useState("");
  const [sortMode] = useState<"MOST_BAD" | "A_Z">("MOST_BAD");


  const [filters, setFilters] = useState<Record<string, "ALL" | "GOOD" | "BAD">>(() => {
    const init: Record<string, "ALL" | "GOOD" | "BAD"> = {};
    for (const s of SECTIONS) init[s.id] = "ALL";
    return init;
  });

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of SECTIONS) init[s.id] = false;
    return init;
  });

  const computed = useMemo(() => {
    const map: Record<string, ComputedRow[]> = {};
    for (const section of SECTIONS) {
      const rows: ComputedRow[] = [];
      for (const r of rawRows) {
        const position = (r["Position"] || "").trim();
        if (!position) continue;

        const target = section.targetsByPosition[position];
        if (!target) continue;

        const value = parsePercent(r[section.column]);
        if (value == null) continue;

        const result = classify(value, target);
        const recAction =
          result === "GOOD"
            ? section.goodAction
            : result === "LOW"
              ? section.lowAction
              : section.highAction;

        rows.push({
          position,
          hands: r["Hands"],
          value,
          target,
          result,
          recAction,
        });
      }
      map[section.id] = rows;
    }
    return map;
  }, [rawRows]);

  const sectionStats = useMemo(() => {
    return SECTIONS.map((s) => {
      const rows = computed[s.id] ?? [];
      const good = rows.filter((r) => r.result === "GOOD").length;
      const bad = rows.length - good;
      const pctGood = rows.length ? (good / rows.length) * 100 : 0;
      return { section: s, rows, good, bad, pctGood };
    });
  }, [computed]);

  const totals = useMemo(() => {
    const totalRows = sectionStats.reduce((acc, x) => acc + x.rows.length, 0);
    const totalGood = sectionStats.reduce((acc, x) => acc + x.good, 0);
    const totalBad = totalRows - totalGood;
    const pctGood = totalRows ? (totalGood / totalRows) * 100 : 0;
    const sectionsWithData = sectionStats.filter((x) => x.rows.length > 0).length;
    const sectionsWithBad = sectionStats.filter((x) => x.bad > 0).length;

    const withData = sectionStats.filter((x) => x.rows.length > 0);
    let goodStats = 0;
    const totalStats = withData.length;
    const badStats = totalStats - goodStats;
    const pctGoodStats = totalStats ? (goodStats / totalStats) * 100 : 0;

    return {
      totalRows,
      totalGood,
      totalBad,
      pctGood,
      sectionsWithData,
      sectionsWithBad,
      totalStats,
      goodStats,
      badStats,
      pctGoodStats,
    };
  }, [sectionStats]);

  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase();

    let list = sectionStats.filter((x) => {
      if (sectionScope === "WITH_BAD" && x.bad === 0) return false;
      if (sectionScope === "WITH_DATA" && x.rows.length === 0) return false;
      if (!q) return true;
      return (
        x.section.title.toLowerCase().includes(q) ||
        x.section.column.toLowerCase().includes(q) ||
        x.section.id.toLowerCase().includes(q)
      );
    });

    if (sortMode === "MOST_BAD") {
      list = list.slice().sort((a, b) => {
        if (b.bad !== a.bad) return b.bad - a.bad;
        if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
        return a.section.title.localeCompare(b.section.title);
      });
    } else {
      list = list.slice().sort((a, b) => a.section.title.localeCompare(b.section.title));
    }

    return list;
  }, [sectionStats, sectionScope, query, sortMode]);

  function onPickFile(file: File) {
    setFilename(file.name);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setRawRows((results.data || []).filter(Boolean));
      },
      error: (err) => {
        console.error(err);
        alert("Failed to parse CSV. Check console for details.");
      },
    });
  }

  function setAllOpen(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const s of SECTIONS) next[s.id] = open;
    setOpenMap(next);
  }

  function rowFilterApply(rows: ComputedRow[], localFilter: "ALL" | "GOOD" | "BAD"): ComputedRow[] {
    const effective = globalRowFilter === "ALL" ? localFilter : globalRowFilter;
    if (effective === "ALL") return rows;
    if (effective === "GOOD") return rows.filter((r) => r.result === "GOOD");
    return rows.filter((r) => r.result !== "GOOD");
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, textAlign: "left" }}>
      <div
        style={{  
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>CSV Stat Dashboard</h1>
            <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
              {filename ? (
                <span>
                  Loaded: <b>{filename}</b> 
                </span>
              ) : (
                <span>Upload your CSV export to begin.</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
            <button type="button" style={smallBtnStyle()} onClick={() => setAllOpen(true)} disabled={!rawRows.length}>
              Expand all
            </button>
            <button type="button" style={smallBtnStyle()} onClick={() => setAllOpen(false)} disabled={!rawRows.length}>
              Collapse all
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
          <div
            style={{
              flex: "1 1 320px",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>OVERALL</div>

            <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{formatPct(totals.pctGood)} good (stats)</div>
              <div style={{ opacity: 0.8, fontWeight: 800 }}>
                Good Stats <span style={{ color: "#6dffb6" }}>{totals.totalGood}</span> · Bad Stats{" "}
                <span style={{ color: "#ff6d6d" }}>{totals.totalBad}</span> · Total <b>{totals.totalRows}</b>
              </div>
            </div>

          </div>


          <div style={{ flex: "1 1 260px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            </div>
          </div>
        </div>
      </div>

      {visibleSections.map(({ section, rows, good, bad, pctGood }) => {
        const localFilter = filters[section.id] ?? "ALL";
        const shown = rowFilterApply(rows, localFilter);

        const shownGood = shown.filter((r) => r.result === "GOOD").length;
        const shownPctGood = shown.length ? (shownGood / shown.length) * 100 : 0;

        const isOpen = openMap[section.id] ?? false;

        return (
          <details
            key={section.id}
            open={isOpen}
            onToggle={(e) => {
              const next = (e.currentTarget as HTMLDetailsElement).open;
              setOpenMap((p) => ({ ...p, [section.id]: next }));
            }}
            style={{
              marginBottom: 14,
              borderRadius: 14,
              border: bad > 0 ? "1px solid rgba(255,109,109,0.22)" : "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
              overflow: "hidden",
            }}
          >
            <summary
              style={{
                listStyle: "none",
                cursor: "pointer",
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 18 }}>{section.title}</b>
                  <span style={{ opacity: 0.75, fontSize: 13, fontWeight: 800 }}>
                    {formatPct(pctGood)} good · Good <span style={{ color: "#6dffb6" }}>{good}</span> · Bad{" "}
                    <span style={{ color: "#ff6d6d" }}>{bad}</span> · Rows <b>{rows.length}</b>
                  </span>
                </div>
                <span style={{ opacity: 0.6, fontSize: 12 }}>{section.column}</span>
              </div>

              <div
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                onClick={(e) => {
                  e.preventDefault();
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFilters((p) => ({ ...p, [section.id]: "ALL" }));
                  }}
                  style={pillStyle(localFilter === "ALL")}
                >
                  All({rows.length})
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFilters((p) => ({ ...p, [section.id]: "GOOD" }));
                  }}
                  style={pillStyle(localFilter === "GOOD")}
                >
                  Good({good})
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFilters((p) => ({ ...p, [section.id]: "BAD" }));
                  }}
                  style={pillStyle(localFilter === "BAD")}
                >
                  Bad({bad})
                </button>

                <span style={{ opacity: 0.65, fontWeight: 800, fontSize: 12, marginLeft: 6 }}>
                  Showing: {shown.length} · {formatPct(shownPctGood)} good
                </span>
              </div>
            </summary>

            <div style={{ padding: "0 14px 14px" }}>
              {shown.length === 0 ? (
                <p style={{ opacity: 0.75, marginTop: 10 }}>
                  {rawRows.length === 0 ? "Load a CSV to see results." : "No rows for this filter."}
                </p>
              ) : (
                <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", opacity: 0.8 }}>
                      <th style={{ padding: "8px 6px" }}>Name</th>
                      <th style={{ padding: "8px 6px" }}>Hero</th>
                      <th style={{ padding: "8px 6px" }}>Result</th>
                      <th style={{ padding: "8px 6px" }}>Target</th>
                      <th style={{ padding: "8px 6px" }}>Rec. action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={`${section.id}-${r.position}`} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <td style={{ padding: "10px 6px" }}>
                          <b>{r.position}</b>
                          {r.hands ? <span style={{ opacity: 0.65, marginLeft: 8 }}>{r.hands}</span> : null}
                        </td>
                        <td style={{ padding: "10px 6px" }}>{r.value.toFixed(2)}%</td>
                        <td style={{ padding: "10px 6px" }}>
                          <span style={badgeStyle(r.result)}>{r.result}</span>
                        </td>
                        <td style={{ padding: "10px 6px" }}>
                          {r.target.min}% - {r.target.max}%
                        </td>
                        <td style={{ padding: "10px 6px" }}>{r.recAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
