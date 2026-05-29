import { useEffect, useState } from "react";
import { api } from "./api";

const C = { green: "#1f7a3a", yellow: "#c98a00", red: "#c0392b", none: "#444" };

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.dashboard().then(setD); }, []);
  if (!d) return <div className="muted">불러오는 중...</div>;

  const stats = d.stats;
  const trendMax = stats ? Math.max(...stats.weekly_trend.flatMap((p) => [p.school, p.regional_average])) : 1;

  return (
    <div className="dash">
      <h2>위기 총괄 대시보드 <small className="muted">· 관리자 전용 (개별 일지 입력 권한 없음)</small></h2>

      {stats && (
        <>
          <div className="stat-source">{stats.source_name} · {stats.source_type} · {stats.stale_reason}</div>

          <div className="risk-index">
            <div>
              <span>우리학교</span>
              <strong>{stats.risk_index.school.toFixed(2)}</strong>
            </div>
            <div>
              <span>시도평균</span>
              <strong>{stats.risk_index.regional_average.toFixed(2)}</strong>
            </div>
            <div>
              <span>전국평균</span>
              <strong>{stats.risk_index.national_average.toFixed(2)}</strong>
            </div>
          </div>

          <h3>6주 추세</h3>
          <div className="trend">
            {stats.weekly_trend.map((p) => (
              <div key={p.week} className="trend-col">
                <div className="trend-bars">
                  <span className="trend-school" style={{ height: `${(p.school / trendMax) * 100}%` }} title={`우리학교 ${p.school}`} />
                  <span className="trend-region" style={{ height: `${(p.regional_average / trendMax) * 100}%` }} title={`시도평균 ${p.regional_average}`} />
                </div>
                <span className="trend-label">{p.week}</span>
              </div>
            ))}
          </div>

          <h3>학년 · 반 위험도</h3>
          <div className="class-grid">
            {stats.class_grid.map((grade) => (
              <div key={grade.grade} className="grade-row">
                <div className="grade-label">{grade.grade}학년</div>
                {grade.classes.map((c) => (
                  <div key={c.class_name} className={`class-cell ${c.color}`}>
                    <b>{c.class_name}</b>
                    <span>{c.risk.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="dash-cards">
        {Object.entries(d.by_school).map(([sc, b]) => (
          <div key={sc} className="dash-card">
            <h3>{sc}학교 · 총 {b.green + b.yellow + b.red + b.none}명</h3>
            <div className="bars">
              {["red", "yellow", "green", "none"].map((k) => (
                <div key={k} className="bar-row">
                  <span className="bar-label">{k}</span>
                  <span className="bar" style={{ width: `${(b[k] || 0) * 36 + 8}px`, background: C[k] }} />
                  <span className="bar-n">{b[k] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3>적색 학생 (즉시 대응 필요) · {d.reds.length}명</h3>
      {d.reds.length === 0 && <div className="muted">현재 적색 학생 없음</div>}
      {d.reds.map((r) => (
        <div key={r.id} className="red-row">
          <span className="dot red" /> {r.display_name} · {r.token} · {r.school}학교 · 점수 {r.score} · {r.updated}
        </div>
      ))}

      <h3>전체 학생 현황</h3>
      <table className="dash-table">
        <thead><tr><th>학생</th><th>학교</th><th>신호</th><th>점수</th><th>최근</th></tr></thead>
        <tbody>
          {d.students.map((s) => (
            <tr key={s.id}>
              <td>{s.display_name}</td><td>{s.school}</td>
              <td><span className="dot" style={{ background: C[s.color] }} /> {s.color}</td>
              <td>{s.score ?? "-"}</td><td>{s.updated ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
