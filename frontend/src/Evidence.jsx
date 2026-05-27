export default function Evidence({ data }) {
  if (!data) return null;
  const { laws, resources } = data;
  return (
    <section className="col evidence">
      <h2>근거 · 자원 (적색 대응 패키지)</h2>

      <h3>법령 근거 <span className="muted">· 케이스별 큐레이션</span></h3>
      {laws.length === 0 && <div className="muted">해당 유형 없음</div>}
      {laws.map((l) => (
        <div key={l.title} className="law">
          <div className="law-t">{l.link
            ? <a href={l.link} target="_blank" rel="noreferrer">{l.title}</a>
            : l.title}</div>
          <div className="law-s">{l.summary}</div>
          <div className="law-src">출처: {l.source} · 법제처 국가법령정보</div>
        </div>
      ))}

      <h3>교내 자원 <span className="muted">· 학교알리미 (우선 연계)</span></h3>
      {resources.internal.map((r, i) => (
        <div key={i} className={`res ${r.available ? "ok" : "no"}`}>
          <b>{r.kind}</b> — {r.available ? "보유" : "미보유"} · {r.note}
          <div className="law-src">출처: {r.source}</div>
        </div>
      ))}

      <h3>교외 자원 <span className="muted">· 실시간 + 캐시 폴백</span></h3>
      {resources.external.map((e, i) => (
        <div key={i} className="res">
          <b>{e.kind}</b> <span className={`mode ${e.source_mode === "실시간" ? "live" : ""}`}>{e.source_mode}</span>
          {e.items.map((it, j) => (
            <div key={j} className="res-item">{it.name} · {it.addr} · {it.tel} <span className="law-src">({it.source})</span></div>
          ))}
        </div>
      ))}

      <h3>외부 전송 비식별 점검</h3>
      <div className="deid">
        <div>전송됨: 통학구역 중심좌표 {JSON.stringify(resources.deidentified["외부전송_데이터"]["통학구역_중심좌표"])} · 사안코드 {resources.deidentified["외부전송_데이터"]["사안코드"]}</div>
        <div className="muted">미포함: {resources.deidentified["포함되지_않음"].join(", ")}</div>
      </div>
    </section>
  );
}
