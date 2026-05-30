"use client";

import Link from "next/link";

const REGIONS = [
  { slug: "gbd",     name: "GBD",    full: "강남·서초·역삼", icon: "🏙️", color: "from-blue-600/20 to-blue-400/5",  border: "border-blue-500/20",    desc: "핵심 오피스 권역" },
  { slug: "ybd",     name: "YBD",    full: "여의도·영등포",   icon: "🌊", color: "from-cyan-600/20 to-cyan-400/5",  border: "border-cyan-500/20",    desc: "금융 중심 권역" },
  { slug: "cbd",     name: "CBD",    full: "종로·을지로·광화문", icon: "🏛️", color: "from-amber-600/20 to-amber-400/5", border: "border-amber-500/20", desc: "도심 업무 권역" },
  { slug: "seongsu", name: "성수",   full: "성수·뚝섬",       icon: "🎨", color: "from-pink-600/20 to-pink-400/5",  border: "border-pink-500/20",    desc: "MZ 핫플 크리에이티브" },
  { slug: "pangyo",  name: "판교",   full: "판교·분당",       icon: "💻", color: "from-green-600/20 to-green-400/5", border: "border-green-500/20",   desc: "테크·스타트업 허브" },
  { slug: "mapo",    name: "마포",   full: "마포·공덕·상암",   icon: "📺", color: "from-violet-600/20 to-violet-400/5", border: "border-violet-500/20", desc: "미디어·콘텐츠 권역" },
  { slug: "jongno",  name: "종로",   full: "종로·인사동·북촌", icon: "🏯", color: "from-red-600/20 to-red-400/5",   border: "border-red-500/20",     desc: "전통·문화 권역" },
  { slug: "hongdae", name: "홍대",   full: "홍대·연남·합정",   icon: "🎵", color: "from-fuchsia-600/20 to-fuchsia-400/5", border: "border-fuchsia-500/20", desc: "F&B·리테일 핫스팟" },
];

export default function ExplorePage() {
  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-1.5">
              📍 권역 탐색
            </h1>
            <p className="text-[10px] text-slate-400">서울 주요 상업용 부동산 권역</p>
          </div>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Region Grid */}
        <div className="grid grid-cols-2 gap-3">
          {REGIONS.map((r) => (
            <div
              key={r.slug}
              className={`rounded-2xl border ${r.border} bg-gradient-to-br ${r.color} p-5 space-y-3 hover:scale-[1.02] transition-all`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{r.icon}</span>
                <div>
                  <p className="text-base font-bold text-white">{r.name}</p>
                  <p className="text-[10px] text-slate-400">{r.full}</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">{r.desc}</p>
              <div className="flex gap-1.5">
                <Link
                  href={`/deal/${r.slug}`}
                  className="flex-1 text-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg py-1.5 text-[10px] font-semibold text-white transition-colors"
                >
                  🏢 매매
                </Link>
                <Link
                  href={`/space/${r.slug}`}
                  className="flex-1 text-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg py-1.5 text-[10px] font-semibold text-white transition-colors"
                >
                  🏪 임대
                </Link>
                <Link
                  href={`/market/${r.slug}`}
                  className="flex-1 text-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg py-1.5 text-[10px] font-semibold text-white transition-colors"
                >
                  📊 시세
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* All Regions CTA */}
        <div className="text-center pt-2">
          <Link
            href="/deal/all"
            className="inline-flex items-center gap-2 bg-white/10 border border-white/10 text-white font-medium rounded-xl px-5 py-2.5 text-xs hover:bg-white/15 transition-colors"
          >
            🌐 전체 매물 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
