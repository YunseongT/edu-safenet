import { useEffect, useState } from "react";
import { api } from "./api";

const C = { green: "#1f7a3a", yellow: "#c98a00", red: "#c0392b", none: "#444" };

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.dashboard().then(setD); }, []);
  if (!d) return <div className="muted">불러오는 중...</div>;

  return (
    <div className="dash">
      <h2>위기 총괄 대시보드 <small className="muted">· 관리자 전용 (개별 일지 입력 권한 없음)</small></h2>

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
