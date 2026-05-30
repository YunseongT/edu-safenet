import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// 슬라이드 9 "V-WORLD 자원지도": 학교·정신과·상담·Wee 마커 시각화.
// VITE_VWORLD_KEY 있으면 VWorld WMTS 타일, 없으면 OSM 폴백(키 없이도 지도 렌더).
const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY;

const GROUPS = {
  school:  { color: "#1f3a5f", label: "학교(통학구역 중심)" },
  medical: { color: "#e8604c", label: "의료·정신건강" },
  counsel: { color: "#2a9d8f", label: "상담" },
  wee:     { color: "#4caf50", label: "Wee" },
  child:   { color: "#f4a261", label: "아동보호" },
  special: { color: "#7b5ea7", label: "특수교육" },
  etc:     { color: "#888", label: "기타" },
};

function dot(group) {
  const c = (GROUPS[group] || GROUPS.etc).color;
  const ring = group === "school" ? "box-shadow:0 0 0 4px rgba(31,58,95,.25);" : "";
  return L.divIcon({
    className: "rm-pin",
    html: `<span style="background:${c};${ring}"></span>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

function esc(v) {
  return String(v || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

export default function ResourceMap({ map }) {
  const ref = useRef(null);
  const inst = useRef(null);

  useEffect(() => {
    if (!ref.current || !map) return;
    const center = map.center || [37.5012, 127.0396];
    const m = L.map(ref.current, { zoomControl: true, attributionControl: true })
      .setView(center, 14);
    inst.current = m;

    const osm = () => L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "© OpenStreetMap" });
    if (VWORLD_KEY) {
      const vw = L.tileLayer(
        `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`,
        { maxZoom: 19, attribution: "© VWorld" }).addTo(m);
      // 키 도메인 미등록 등으로 타일 403 → OSM로 1회 폴백.
      let fell = false;
      vw.on("tileerror", () => {
        if (fell) return;
        fell = true;
        m.removeLayer(vw);
        osm().addTo(m);
      });
    } else {
      osm().addTo(m);
    }

    const pts = (map.points || []).filter((p) => p.lat && p.lng);
    const latlngs = [];
    for (const p of pts) {
      latlngs.push([p.lat, p.lng]);
      L.marker([p.lat, p.lng], { icon: dot(p.group) })
        .bindPopup([
          `<b>${esc(p.name || p.kind)}</b>`,
          esc(p.kind),
          p.addr ? esc(p.addr) : "",
          p.tel ? `☎ ${esc(p.tel)}` : "",
          p.source ? `<span class="law-src">${esc(p.source)}</span>` : "",
        ].filter(Boolean).join("<br>"))
        .addTo(m);
    }
    if (latlngs.length > 1) m.fitBounds(latlngs, { padding: [40, 40], maxZoom: 15 });

    // 컨테이너 크기 확정 후 타일 재계산(오버레이 내부 렌더 대응).
    setTimeout(() => m.invalidateSize(), 60);
    return () => { m.remove(); inst.current = null; };
  }, [map]);

  if (!map) return null;
  const used = new Set((map.points || []).map((p) => p.group));
  return (
    <div className="rm-wrap">
      <div ref={ref} className="rm-map" />
      <div className="rm-legend">
        {[...used].map((g) => (
          <span key={g} className="rm-leg">
            <i style={{ background: (GROUPS[g] || GROUPS.etc).color }} />
            {(GROUPS[g] || GROUPS.etc).label}
          </span>
        ))}
        <span className="rm-src">{VWORLD_KEY ? "타일: VWorld" : "타일: OSM(키 미설정)"}</span>
      </div>
    </div>
  );
}
