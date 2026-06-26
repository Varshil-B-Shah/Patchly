// Static browser-frame mockup showing Patchly in action.
// Server component — no interactivity needed (CSS handles the cursor blink).

export function DemoMockup() {
  return (
    <section className="py-10 px-6 max-w-4xl mx-auto relative">
      {/* Tape strips pinning the browser frame */}
      <div className="tape absolute top-14 left-4 w-14 h-3 rotate-[-7deg] z-10" />
      <div className="tape-cool tape absolute top-14 right-4 w-14 h-3 rotate-[6deg] z-10" />

      <div className="rounded-xl overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,.06),0_20px_70px_rgba(0,0,0,.7)] bg-[#12141e] relative">
        {/* Browser chrome */}
        <div className="bg-[#1e2030] px-4 py-3 flex items-center gap-3 border-b border-white/5">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
          </div>
          <div className="flex-1 bg-[#12141e] rounded px-3 py-1.5 text-[0.7rem] text-white/30" style={{ fontFamily: 'var(--font-body)' }}>
            localhost:5173
          </div>
        </div>

        {/* App content */}
        <div className="grid relative" style={{ gridTemplateColumns: '190px 1fr', minHeight: '300px' }}>
          {/* Sidebar */}
          <div className="bg-[#12141e] px-3 py-5 flex flex-col gap-1">
            <div className="text-[0.58rem] text-white/20 mb-2 tracking-widest px-2" style={{ fontFamily: 'var(--font-body)' }}>NAVIGATION</div>
            {['Overview', 'Users', 'Billing', 'Settings'].map((item, i) => (
              <div
                key={item}
                className={`px-2.5 py-1.5 rounded text-[0.67rem] ${i === 0 ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/35'}`}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {item}
              </div>
            ))}
          </div>

          {/* Main area */}
          <div className="bg-[#edeef2] p-4 flex flex-col gap-2.5">
            <div className="h-4 w-1/2 bg-slate-300 rounded" />
            <div className="flex gap-2">
              {[
                'linear-gradient(90deg,#6366F1,#818CF8)',
                'linear-gradient(90deg,#0EA5E9,#38BDF8)',
                'linear-gradient(90deg,#22C55E,#4ADE80)',
              ].map((bg, i) => (
                <div key={i} className="flex-1 bg-white rounded-md p-3 shadow-sm">
                  <div className="h-1.5 bg-slate-200 rounded mb-1.5" />
                  <div className="h-1.5 w-2/5 bg-slate-200 rounded mb-2" />
                  <div className="h-5 rounded" style={{ background: bg }} />
                </div>
              ))}
            </div>
          </div>

          {/* Patchly highlight */}
          <div
            className="absolute glow-pulse"
            style={{ top: 56, left: 196, right: 12, bottom: 52, border: '1.5px solid #6366F1', background: 'rgba(99,102,241,0.06)', borderRadius: 5, pointerEvents: 'none' }}
          />

          {/* Floating toolbar */}
          <div
            className="absolute bg-white rounded-lg px-2 py-1.5 flex items-center gap-1.5 shadow-xl"
            style={{ top: 10, left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
          >
            <span className="bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded">AI Mode</span>
            <span className="text-gray-400 px-1 py-0.5">Tailwind</span>
            <span className="text-gray-400 px-1 py-0.5">Comment</span>
            <div className="w-px h-3 bg-gray-200 mx-1" />
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>

          {/* Prompt bar */}
          <div
            className="absolute bg-white rounded px-3 py-2 flex items-center gap-2 shadow-lg"
            style={{ bottom: 6, left: 196, right: 12, fontSize: '0.67rem', fontFamily: 'var(--font-body)' }}
          >
            <span className="text-indigo-500 font-bold text-[0.6rem]">✦</span>
            <span className="flex-1 text-slate-700">
              Make the stat cards slightly rounded with a shadow
              <span className="cursor-blink inline-block w-px h-3 bg-indigo-500 ml-0.5 align-middle" />
            </span>
            <button className="bg-indigo-600 text-white text-[0.6rem] font-semibold px-2 py-1 rounded">Apply</button>
          </div>
        </div>
      </div>
    </section>
  )
}
