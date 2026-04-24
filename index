import { useState, useEffect } from "react";

// ── HELPERS ───────────────────────────────────────────────────────────────
function polar(r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [150 + r * Math.cos(rad), 150 + r * Math.sin(rad)];
}
function wedge(r1, r2, a1, a2) {
  const f = n => n.toFixed(1);
  const [x1,y1]=polar(r1,a1),[x2,y2]=polar(r2,a1);
  const [x3,y3]=polar(r2,a2),[x4,y4]=polar(r1,a2);
  const la = a2-a1>180?1:0;
  return `M${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${r2},${r2} 0 ${la},1 ${f(x3)},${f(y3)} L${f(x4)},${f(y4)} A${r1},${r1} 0 ${la},0 ${f(x1)},${f(y1)}Z`;
}

// ── DATA ──────────────────────────────────────────────────────────────────
const ZONES = [
  { id:"A", name:"全國名店區", short:"名店", emoji:"🏆", color:"#ff3c3c", a1:2, a2:70, mid:36,
    desc:"全台指標品牌齊聚，製造話題與排隊效應", count:14,
    booths:[
      {n:"A01",name:"基隆廟口鹹酥雞",item:"脆皮黃金雞",v:487},
      {n:"A02",name:"師大夜市元祖",item:"九層塔大雞排",v:423},
      {n:"A03",name:"士林老牌炸物",item:"椒鹽雞腿",v:398},
      {n:"A04",name:"西門人氣炸物王",item:"辣椒鹹酥雞",v:376},
      {n:"A05",name:"台中一中街名店",item:"麻辣雞丁串",v:355},
      {n:"A06",name:"台南廟前傳奇",item:"鹽酥雞皮卷",v:340},
      {n:"A07",name:"嘉義文化路名攤",item:"火雞腿排",v:318},
      {n:"A08",name:"花蓮市場炸雞",item:"原住民香料炸雞",v:302},
      {n:"A09",name:"宜蘭夜市霸主",item:"三星蔥炸雞",v:289},
      {n:"A10",name:"台東知本老店",item:"野薑花雞塊",v:267},
      {n:"A11",name:"屏東恆春傳奇",item:"墾丁蒜香炸雞",v:245},
      {n:"A12",name:"雲林斗六老字號",item:"梅汁脆皮雞",v:234},
      {n:"A13",name:"彰化鹿港風味",item:"古早味炸肉串",v:221},
      {n:"A14",name:"南投埔里名攤",item:"竹炭炸雞",v:198},
    ]},
  { id:"B", name:"高雄在地私藏", short:"私藏", emoji:"🌟", color:"#ff8800", a1:74, a2:142, mid:108,
    desc:"高雄在地特色店家，結合城市文化故事", count:14,
    booths:[
      {n:"B01",name:"鹽埕老街鹹酥雞",item:"港都脆皮雞",v:445},
      {n:"B02",name:"旗津海產路炸物",item:"海風椒鹽雞",v:412},
      {n:"B03",name:"六合夜市名攤",item:"夜市炸雞腿",v:389},
      {n:"B04",name:"三鳳中街私藏",item:"川味麻辣雞",v:367},
      {n:"B05",name:"左營眷村炸雞",item:"眷村風味雞排",v:348},
      {n:"B06",name:"鳳山廟口老店",item:"鳳梨酥炸雞",v:334},
      {n:"B07",name:"岡山大蒜炸雞",item:"岡山蒜香雞",v:319},
      {n:"B08",name:"美濃客家炸物",item:"客家桔醬炸雞",v:305},
      {n:"B09",name:"旗山香蕉炸雞",item:"旗山蕉香雞塊",v:291},
      {n:"B10",name:"燕巢芭樂炸雞",item:"熱帶風味炸雞",v:278},
      {n:"B11",name:"大樹荔枝炸雞",item:"荔枝蜜炸雞腿",v:261},
      {n:"B12",name:"茄萣海風炸物",item:"海鹽脆皮雞",v:247},
      {n:"B13",name:"甲仙芋頭炸物",item:"芋香炸雞球",v:233},
      {n:"B14",name:"桃源山地炸雞",item:"山胡椒炸雞",v:219},
    ]},
  { id:"C", name:"潮流創意口味", short:"創意", emoji:"✨", color:"#d4b800", a1:146, a2:214, mid:180,
    desc:"導入創新元素，吸引年輕族群與社群關注", count:14,
    booths:[
      {n:"C01",name:"黑化鹹酥雞",item:"竹炭脆皮雞",v:534},
      {n:"C02",name:"金箔炸雞台",item:"金箔炸雞腿",v:512},
      {n:"C03",name:"彩虹炸物攤",item:"七色炸雞串",v:489},
      {n:"C04",name:"韓式辣炸雞",item:"韓式甜辣雞",v:467},
      {n:"C05",name:"和風天婦羅雞",item:"抹茶鹽炸雞",v:445},
      {n:"C06",name:"泰式打拋炸雞",item:"泰式打拋雞",v:423},
      {n:"C07",name:"印度咖哩炸雞",item:"瑪薩拉炸雞",v:401},
      {n:"C08",name:"波霸奶茶炸雞",item:"珍奶鹹酥雞",v:389},
      {n:"C09",name:"玫瑰鹽炸雞",item:"喜馬拉雅鹽雞",v:378},
      {n:"C10",name:"松露炸雞",item:"松露橄欖炸雞",v:356},
      {n:"C11",name:"麻辣鍋底炸雞",item:"火鍋風味雞塊",v:334},
      {n:"C12",name:"啤酒炸雞",item:"精釀啤酒炸雞",v:312},
      {n:"C13",name:"梅子炸雞",item:"脆梅風味炸雞",v:289},
      {n:"C14",name:"辣椒巧克力雞",item:"黑巧克力辣炸雞",v:267},
    ]},
  { id:"D", name:"清涼飲品微醺", short:"飲品", emoji:"🍺", color:"#00b890", a1:218, a2:286, mid:252,
    desc:"提供搭配選擇，延長停留時間與夜間氛圍", count:14,
    booths:[
      {n:"D01",name:"精釀啤酒配炸雞",item:"台灣精釀IPA",v:423},
      {n:"D02",name:"手搖鮮奶茶",item:"珍珠奶茶",v:398},
      {n:"D03",name:"氣泡果汁攤",item:"現榨木瓜牛奶",v:376},
      {n:"D04",name:"台灣啤酒特攤",item:"台啤金牌冰桶",v:354},
      {n:"D05",name:"水果酸甜汁",item:"百香果冰沙",v:332},
      {n:"D06",name:"日式柚子沙瓦",item:"柚子氣泡飲",v:310},
      {n:"D07",name:"韓式馬格利",item:"米酒氣泡飲",v:289},
      {n:"D08",name:"台灣蔗糖冷飲",item:"黑糖蔗汁",v:267},
      {n:"D09",name:"椰子水特區",item:"現開椰子水",v:245},
      {n:"D10",name:"文青酸啤酒",item:"比利時白啤",v:234},
      {n:"D11",name:"野草莓汽水",item:"自製果汁氣泡水",v:222},
      {n:"D12",name:"古早味麥仔茶",item:"台式麥茶",v:211},
      {n:"D13",name:"薑汁汽水",item:"老薑汽水",v:198},
      {n:"D14",name:"仙草冰涼飲",item:"仙草蜜拿鐵",v:187},
    ]},
  { id:"E", name:"親子互動體驗", short:"親子", emoji:"🎪", color:"#ff55a0", a1:290, a2:358, mid:324,
    desc:"規劃親子互動活動，拓展家庭客群參與", count:14,
    booths:[
      {n:"E01",name:"小廚師體驗攤",item:"親子炸物體驗",v:512},
      {n:"E02",name:"DIY調味料站",item:"自製醬料包",v:489},
      {n:"E03",name:"雞腿扭蛋機",item:"扭蛋換炸物",v:467},
      {n:"E04",name:"鹹酥雞拼圖攤",item:"互動拼圖挑戰",v:445},
      {n:"E05",name:"炸物模型彩繪",item:"DIY模型彩繪",v:423},
      {n:"E06",name:"AR拍照合成站",item:"AR打卡拍照",v:401},
      {n:"E07",name:"套圈圈換炸雞",item:"套圈兌換小吃",v:389},
      {n:"E08",name:"小朋友專區炸物",item:"兒童小份炸物",v:367},
      {n:"E09",name:"炸物風味猜猜樂",item:"猜味遊戲",v:345},
      {n:"E10",name:"鹹酥雞小書攤",item:"食育繪本閱讀",v:323},
      {n:"E11",name:"手作炸物貼紙",item:"DIY貼紙",v:301},
      {n:"E12",name:"親子競炸挑戰",item:"快炸比賽",v:289},
      {n:"E13",name:"食農教育攤",item:"食農認識課",v:267},
      {n:"E14",name:"玉米炸物甜點",item:"玉米炸甜球",v:245},
    ]},
];

const initRankings = () =>
  ZONES.flatMap(z => z.booths.map(b => ({...b, zoneName:z.name, zoneColor:z.color, zoneEmoji:z.emoji})))
    .sort((a,b) => b.v-a.v).slice(0,10);

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&display=swap');
*{box-sizing:border-box;}
body{margin:0;}
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-track{background:#120500;}
::-webkit-scrollbar-thumb{background:#ff7700;border-radius:2px;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
@keyframes slideIn{from{opacity:0;transform:translateX(12px);}to{opacity:1;transform:none;}}
@keyframes popIn{from{transform:scale(0.85);opacity:0;}to{transform:scale(1);opacity:1;}}
@keyframes livePulse{0%,100%{opacity:1;}50%{opacity:0.5;}}
@keyframes barGrow{from{width:0%;}to{width:var(--w);}}
.zone-wedge{cursor:pointer;transition:all 0.2s;}
.zone-wedge:hover path{filter:brightness(1.2);}
.booth-card{transition:background 0.15s,border-color 0.15s;}
.booth-card:hover{background:rgba(255,255,255,0.07)!important;}
.tab-btn{transition:all 0.2s;white-space:nowrap;cursor:pointer;border:none;font-family:inherit;}
.star-btn{transition:transform 0.12s;cursor:pointer;background:none;border:none;}
.star-btn:hover{transform:scale(1.25)!important;}
.vote-btn{transition:all 0.2s;cursor:pointer;border:none;font-family:inherit;}
.vote-btn:not(:disabled):hover{transform:translateY(-1px);filter:brightness(1.1);}
.legend-pill{transition:all 0.2s;cursor:pointer;}
.legend-pill:hover{opacity:0.85;}
`;

// ── MAIN ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState(0);
  // Map tab
  const [zone, setZone] = useState(null);
  const [hovered, setHovered] = useState(null);
  // Vote tab
  const [selected, setSelected] = useState("");
  const [stars, setStars] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [voted, setVoted] = useState(false);
  // Rankings
  const [rankings, setRankings] = useState(initRankings);

  // Simulate live vote ticking
  useEffect(() => {
    const t = setInterval(() => {
      setRankings(r =>
        [...r.map(b => ({...b, v: b.v + Math.floor(Math.random()*4)}))]
          .sort((a,b) => b.v-a.v)
      );
    }, 1800);
    return () => clearInterval(t);
  }, []);

  const handleVote = () => {
    if (!selected || !stars) return;
    setVoted(true);
    setRankings(r =>
      [...r.map(b => b.n===selected ? {...b, v:b.v+stars*15} : b)]
        .sort((a,b) => b.v-a.v)
    );
    setTimeout(() => { setVoted(false); setSelected(""); setStars(0); }, 3200);
  };

  const colors = { bg:"#0d0400", card:"rgba(255,80,0,0.06)", border:"rgba(255,120,0,0.18)" };

  return (
    <div style={{minHeight:"100vh", background:colors.bg, fontFamily:"'Noto Serif TC','PingFang TC',serif", color:"#fff8e7", overflowX:"hidden"}}>
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <div style={{background:"linear-gradient(180deg,#1e0800 0%,#0d0400 100%)", borderBottom:"1px solid rgba(255,120,0,0.2)", padding:"18px 20px 0"}}>
        <div style={{maxWidth:920, margin:"0 auto"}}>
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:14}}>
            <span style={{fontSize:26}}>🍗</span>
            <div>
              <div style={{fontSize:"clamp(15px,3vw,21px)", fontWeight:900, color:"#ffd700", textShadow:"0 0 24px rgba(255,180,0,0.45)", lineHeight:1.2}}>
                2025 全國鹹酥雞嘉年華
              </div>
              <div style={{fontSize:10, letterSpacing:3, color:"rgba(255,200,100,0.45)", marginTop:2}}>
                KAOHSIUNG · 互動體驗平台 DEMO
              </div>
            </div>
            <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap:6}}>
              <span style={{width:7, height:7, borderRadius:"50%", background:"#ff3c3c", display:"inline-block", animation:"livePulse 1.2s ease infinite"}}/>
              <span style={{fontSize:10, color:"rgba(255,100,100,0.7)", letterSpacing:1}}>LIVE</span>
            </div>
          </div>
          {/* Tabs */}
          <div style={{display:"flex", gap:0}}>
            {[["🗺", "場地地圖"],["⭐","民眾評審"],["🏆","即時排行"]].map(([icon,label],i) => (
              <button key={i} className="tab-btn" onClick={() => setTab(i)}
                style={{
                  background: tab===i ? "rgba(255,120,0,0.18)" : "transparent",
                  borderBottom: tab===i ? "2px solid #ff7700" : "2px solid transparent",
                  color: tab===i ? "#ffaa44" : "rgba(255,200,150,0.45)",
                  padding:"10px clamp(12px,3vw,20px)",
                  fontSize:"clamp(11px,2.5vw,13px)", fontWeight: tab===i ? 700 : 400,
                }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:920, margin:"0 auto", padding:"20px 16px 40px"}}>

        {/* ═══════ TAB 0: MAP ═══════ */}
        {tab===0 && (
          <div style={{animation:"fadeIn 0.35s ease"}}>
            <div style={{display:"flex", gap:20, flexWrap:"wrap", alignItems:"flex-start"}}>

              {/* SVG Map */}
              <div style={{flexShrink:0, background:colors.card, border:`1px solid ${colors.border}`, borderRadius:12, padding:"18px 18px 14px", textAlign:"center"}}>
                <div style={{fontSize:10, letterSpacing:4, color:"rgba(255,150,50,0.55)", marginBottom:14}}>
                  ← 點擊扇形區域查看攤位 →
                </div>
                <svg viewBox="0 0 300 300" width={Math.min(280, window.innerWidth-72)} height={Math.min(280, window.innerWidth-72)} style={{display:"block",margin:"0 auto",overflow:"visible"}}>
                  {/* Dashed rings */}
                  {[143,103,63].map(r=>(
                    <circle key={r} cx={150} cy={150} r={r} fill="none" stroke="rgba(255,100,0,0.1)" strokeWidth={1} strokeDasharray="5 5"/>
                  ))}
                  {/* Zones */}
                  {ZONES.map(z=>{
                    const sel = zone?.id===z.id, hov = hovered===z.id;
                    const outerR = sel ? 150 : hov ? 147 : 140;
                    return (
                      <g key={z.id} className="zone-wedge"
                        onClick={() => setZone(zone?.id===z.id ? null : z)}
                        onMouseEnter={() => setHovered(z.id)}
                        onMouseLeave={() => setHovered(null)}>
                        <path d={wedge(46, outerR, z.a1, z.a2)}
                          fill={sel ? z.color : hov ? z.color+"bb" : z.color+"55"}
                          stroke={sel||hov ? z.color : z.color+"30"}
                          strokeWidth={sel ? 2 : 1}
                          style={{
                            transition:"all 0.22s",
                            filter: sel ? `drop-shadow(0 0 10px ${z.color}99)` : hov ? `drop-shadow(0 0 5px ${z.color}66)` : "none"
                          }}
                        />
                        {/* Emoji label */}
                        {(()=>{const[lx,ly]=polar(93,z.mid);return(
                          <text x={lx} y={ly-6} textAnchor="middle" dominantBaseline="middle" fontSize={15}
                            fill="white" style={{userSelect:"none",pointerEvents:"none",transition:"all 0.2s",
                            opacity:sel||hov?1:0.8}}>
                            {z.emoji}
                          </text>
                        );})()}
                        {/* Short name */}
                        {(()=>{const[lx,ly]=polar(93,z.mid);return(
                          <text x={lx} y={ly+11} textAnchor="middle" dominantBaseline="middle"
                            fontSize={7} fill={sel||hov?"#fff8e7":"rgba(255,220,150,0.7)"}
                            style={{userSelect:"none",pointerEvents:"none",fontFamily:"'Noto Serif TC',sans-serif",transition:"all 0.2s"}}>
                            {z.short}
                          </text>
                        );})()}
                        {/* Booth count outer */}
                        {(()=>{const[lx,ly]=polar(156,z.mid);return(
                          <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                            fontSize={7} fill={sel ? "#fff" : z.color+"99"}
                            style={{userSelect:"none",pointerEvents:"none",transition:"all 0.2s"}}>
                            {z.count}攤
                          </text>
                        );})()}
                      </g>
                    );
                  })}
                  {/* Center stage */}
                  <circle cx={150} cy={150} r={44} fill="rgba(255,140,0,0.1)" stroke="rgba(255,140,0,0.35)" strokeWidth={1.5}/>
                  <circle cx={150} cy={150} r={44} fill="none" stroke="rgba(255,140,0,0.15)" strokeWidth={8}/>
                  <text x={150} y={144} textAnchor="middle" dominantBaseline="middle" fontSize={20} fill="#ffd700">🍗</text>
                  <text x={150} y={163} textAnchor="middle" fontSize={7.5} fill="rgba(255,210,100,0.75)"
                    fontFamily="'Noto Serif TC',sans-serif">主舞台</text>
                </svg>

                {/* Legend pills */}
                <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginTop:14}}>
                  {ZONES.map(z=>(
                    <div key={z.id} className="legend-pill"
                      onClick={() => setZone(zone?.id===z.id ? null : z)}
                      style={{
                        display:"flex",alignItems:"center",gap:5,
                        padding:"4px 11px",borderRadius:20,
                        background: zone?.id===z.id ? z.color+"28" : "rgba(255,255,255,0.04)",
                        border:`1px solid ${zone?.id===z.id ? z.color+"88" : "rgba(255,255,255,0.08)"}`,
                        fontSize:11, color: zone?.id===z.id ? "#fff" : "rgba(255,220,150,0.55)",
                      }}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:z.color,display:"inline-block",flexShrink:0}}/>
                      {z.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Booth Panel */}
              <div style={{flex:1,minWidth:240,minHeight:360}}>
                {!zone ? (
                  <div style={{height:"100%",minHeight:300,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",
                    textAlign:"center",color:"rgba(255,200,150,0.35)",padding:32,
                    border:`1px dashed rgba(255,120,0,0.15)`,borderRadius:12,}}>
                    <div style={{fontSize:44,marginBottom:14,opacity:0.5}}>👆</div>
                    <div style={{fontSize:14,lineHeight:1.8}}>點擊左側地圖中的<br/>任意扇形區域</div>
                    <div style={{fontSize:11,marginTop:10,color:"rgba(255,200,150,0.2)"}}>共 5 大展區 · 70 個攤位</div>
                  </div>
                ) : (
                  <div style={{animation:"slideIn 0.25s ease"}}>
                    {/* Zone header */}
                    <div style={{
                      padding:"14px 18px",borderRadius:"10px 10px 0 0",
                      background:`linear-gradient(135deg,${zone.color}20,${zone.color}0a)`,
                      border:`1px solid ${zone.color}40`,borderBottom:"none",
                    }}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:22}}>{zone.emoji}</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:15,color:zone.color,lineHeight:1.2}}>{zone.name}</div>
                          <div style={{fontSize:11,color:"rgba(255,220,150,0.5)",marginTop:2}}>{zone.desc}</div>
                        </div>
                        <button onClick={()=>setZone(null)}
                          style={{background:"none",border:"none",color:"rgba(255,200,150,0.4)",cursor:"pointer",fontSize:18,lineHeight:1,padding:4}}>
                          ✕
                        </button>
                      </div>
                      <div style={{marginTop:10,display:"flex",gap:8}}>
                        <span style={{fontSize:10,padding:"2px 10px",borderRadius:20,
                          background:zone.color+"22",border:`1px solid ${zone.color}44`,color:zone.color}}>
                          {zone.count} 個攤位
                        </span>
                        <span style={{fontSize:10,padding:"2px 10px",borderRadius:20,
                          background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                          color:"rgba(255,200,150,0.5)"}}>
                          點擊攤位可查看詳情
                        </span>
                      </div>
                    </div>
                    {/* Booth grid */}
                    <div style={{
                      border:`1px solid ${zone.color}33`,borderTop:"none",borderRadius:"0 0 10px 10px",
                      padding:12,maxHeight:390,overflowY:"auto",
                      background:"rgba(0,0,0,0.2)",
                    }}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {zone.booths.map(b=>(
                          <div key={b.n} className="booth-card"
                            style={{
                              padding:"10px 12px",borderRadius:7,cursor:"pointer",
                              background:"rgba(255,255,255,0.03)",
                              border:`1px solid ${zone.color}18`,
                            }}>
                            <div style={{fontSize:10,color:zone.color,fontWeight:700,letterSpacing:1.5}}>{b.n}</div>
                            <div style={{fontSize:12,fontWeight:700,color:"#fff8e7",margin:"4px 0 3px",lineHeight:1.3}}>{b.name}</div>
                            <div style={{fontSize:10,color:"rgba(255,200,150,0.5)"}}>⭐ {b.item}</div>
                            <div style={{display:"flex",justifyContent:"space-between",marginTop:6,alignItems:"center"}}>
                              <div style={{fontSize:10,color:"rgba(255,200,150,0.3)"}}>🗳 {b.v.toLocaleString()} 票</div>
                              <div style={{width:`${Math.round(b.v/534*100)}%`,height:2,background:zone.color+"66",borderRadius:1,maxWidth:40}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Feature description cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginTop:20}}>
              {[
                {icon:"🎯",title:"標靶式互動地圖",desc:"五大展區以同心圓扇形呈現，點擊任一區域即展開該區所有攤位資訊，動線直覺清晰"},
                {icon:"📍",title:"攤位即時資訊",desc:"每攤顯示攤位編號、特色品項與即時得票數，方便民眾事前規劃參觀路線"},
                {icon:"📱",title:"行動裝置優化",desc:"手機掃碼即可使用，現場搭配 QR Code 觸點，引導民眾數位參與"},
              ].map((c,i)=>(
                <div key={i} style={{padding:"14px 16px",background:colors.card,border:`1px solid ${colors.border}`,borderRadius:10}}>
                  <div style={{fontSize:22,marginBottom:8}}>{c.icon}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#ffaa44",marginBottom:5}}>{c.title}</div>
                  <div style={{fontSize:11,color:"rgba(255,200,150,0.55)",lineHeight:1.7}}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════ TAB 1: VOTE ═══════ */}
        {tab===1 && (
          <div style={{animation:"fadeIn 0.35s ease",display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,flexWrap:"wrap",alignItems:"start"}}>

            {/* Vote form */}
            <div style={{background:colors.card,border:`1px solid ${colors.border}`,borderRadius:12,padding:22,gridColumn:"1"}}>
              <div style={{fontSize:17,fontWeight:900,color:"#ffd700",marginBottom:4}}>⭐ 民眾評審投票</div>
              <div style={{fontSize:11,color:"rgba(255,200,150,0.45)",marginBottom:22,lineHeight:1.7}}>
                您就是評審！每位民眾每日可投票一次<br/>選出心目中的鹹酥雞之王
              </div>

              {voted ? (
                <div style={{textAlign:"center",padding:"36px 16px",animation:"popIn 0.45s ease"}}>
                  <div style={{fontSize:52,marginBottom:14}}>🎉</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#ffd700",marginBottom:8}}>感謝您的評分！</div>
                  <div style={{fontSize:12,color:"rgba(255,200,150,0.5)"}}>您的票數已即時更新至排行榜</div>
                </div>
              ) : (<>
                {/* Step 1 */}
                <div style={{marginBottom:18}}>
                  <div style={{fontSize:10,letterSpacing:3,color:"rgba(255,150,50,0.65)",marginBottom:8}}>STEP 1 · 選擇攤位</div>
                  <select value={selected} onChange={e=>setSelected(e.target.value)}
                    style={{width:"100%",padding:"10px 14px",background:"rgba(255,255,255,0.05)",
                      border:"1px solid rgba(255,120,0,0.3)",borderRadius:7,
                      color:selected?"#fff8e7":"rgba(255,200,150,0.4)",
                      fontSize:13,fontFamily:"inherit",outline:"none",cursor:"pointer",
                    }}>
                    <option value="">-- 請選擇攤位編號 --</option>
                    {ZONES.map(z=>(
                      <optgroup key={z.id} label={`${z.emoji} ${z.name}`}>
                        {z.booths.map(b=>(
                          <option key={b.n} value={b.n}>{b.n} · {b.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Step 2 */}
                <div style={{marginBottom:18}}>
                  <div style={{fontSize:10,letterSpacing:3,color:"rgba(255,150,50,0.65)",marginBottom:10}}>STEP 2 · 給予評分</div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {[1,2,3,4,5].map(s=>(
                      <button key={s} className="star-btn" onClick={()=>setStars(s)}
                        onMouseEnter={()=>setHoverStar(s)} onMouseLeave={()=>setHoverStar(0)}
                        style={{
                          fontSize:30,padding:2,lineHeight:1,
                          transform: (hoverStar>=s||stars>=s) ? "scale(1.18)" : "scale(1)",
                          filter: (hoverStar>=s||stars>=s) ? "drop-shadow(0 0 6px gold)" : "grayscale(1) opacity(0.35)",
                        }}>⭐</button>
                    ))}
                    {stars>0 && (
                      <span style={{fontSize:12,color:"rgba(255,200,150,0.6)",marginLeft:4}}>
                        {["","普通","還不錯","很推薦","非常好","超級推薦！"][stars]}
                      </span>
                    )}
                  </div>
                </div>

                {/* QR hint */}
                <div style={{display:"flex",gap:12,alignItems:"center",
                  background:"rgba(255,200,100,0.04)",border:"1px solid rgba(255,200,100,0.12)",
                  borderRadius:8,padding:"10px 14px",marginBottom:18}}>
                  <div style={{width:48,height:48,flexShrink:0,borderRadius:6,
                    background:"rgba(255,200,100,0.08)",border:"1px dashed rgba(255,200,100,0.25)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>📱</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"rgba(255,200,150,0.7)"}}>現場掃碼驗證投票</div>
                    <div style={{fontSize:10,color:"rgba(255,200,150,0.35)",marginTop:2,lineHeight:1.6}}>
                      掃描現場 QR Code → 手機號碼驗證 → 投票完成
                    </div>
                  </div>
                </div>

                <button onClick={handleVote} disabled={!selected||!stars} className="vote-btn"
                  style={{
                    width:"100%",padding:"13px",borderRadius:8,
                    background:selected&&stars?"linear-gradient(135deg,#ff7700,#ff3300)":"rgba(255,255,255,0.07)",
                    color:selected&&stars?"#fff":"rgba(255,200,150,0.25)",
                    fontSize:14,fontWeight:700,
                    boxShadow:selected&&stars?"0 4px 22px rgba(255,80,0,0.38)":"none",
                    cursor:selected&&stars?"pointer":"not-allowed",
                  }}>
                  🗳 送出我的評分
                </button>
              </>)}
            </div>

            {/* How it works */}
            <div style={{display:"flex",flexDirection:"column",gap:12,gridColumn:"2"}}>
              <div style={{background:colors.card,border:`1px solid ${colors.border}`,borderRadius:12,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:"#ffaa44",marginBottom:14}}>🔧 數位評審機制說明</div>
                {[
                  {step:"01",title:"現場掃碼",desc:"攤位旁設置 QR Code 觸點，掃碼即開啟投票頁面"},
                  {step:"02",title:"手機驗證",desc:"輸入手機號碼取得 OTP，確保每人每日一票公正性"},
                  {step:"03",title:"評分投票",desc:"5星評分制，可備註評語，增加互動深度"},
                  {step:"04",title:"即時更新",desc:"票數即時計算，排行榜每 30 秒同步更新"},
                ].map(s=>(
                  <div key={s.step} style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
                    <div style={{width:26,height:26,borderRadius:"50%",background:"rgba(255,120,0,0.18)",
                      border:"1px solid rgba(255,120,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,color:"#ff9944",fontWeight:700,flexShrink:0}}>
                      {s.step}
                    </div>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:"#fff8e7",marginBottom:2}}>{s.title}</div>
                      <div style={{fontSize:11,color:"rgba(255,200,150,0.45)",lineHeight:1.6}}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{background:"rgba(255,80,0,0.08)",border:"1px solid rgba(255,120,0,0.25)",
                borderRadius:12,padding:16,textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>🏆</div>
                <div style={{fontSize:13,fontWeight:700,color:"#ffd700",marginBottom:4}}>鹹酥雞王</div>
                <div style={{fontSize:11,color:"rgba(255,200,150,0.5)",lineHeight:1.7}}>
                  票選第一名獲頒官方認證「全國鹹酥雞王」牌匾<br/>
                  並獲得下屆優先參展資格與媒體曝光
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ TAB 2: RANKINGS ═══════ */}
        {tab===2 && (
          <div style={{animation:"fadeIn 0.35s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div>
                <div style={{fontSize:17,fontWeight:900,color:"#ffd700"}}>🏆 即時票選排行榜</div>
                <div style={{fontSize:10,color:"rgba(255,200,150,0.4)",marginTop:4,letterSpacing:1}}>
                  每 30 秒自動更新 · LIVE RESULTS
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"#ff3c3c",display:"inline-block",animation:"livePulse 1s ease infinite"}}/>
                <span style={{fontSize:10,color:"rgba(255,100,100,0.65)"}}>直播中</span>
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {rankings.map((b,i)=>{
                const maxV = rankings[0].v;
                const pct = (b.v/maxV*100).toFixed(1);
                const medals=["🥇","🥈","🥉"];
                return (
                  <div key={b.n} style={{
                    position:"relative",overflow:"hidden",
                    padding:"13px 16px",borderRadius:9,
                    background: i<3 ? `${b.zoneColor}10` : "rgba(255,255,255,0.025)",
                    border:`1px solid ${i<3 ? b.zoneColor+"30" : "rgba(255,255,255,0.06)"}`,
                    display:"flex",alignItems:"center",gap:12,
                  }}>
                    {/* Progress bar */}
                    <div style={{
                      position:"absolute",left:0,top:0,bottom:0,
                      width:`${pct}%`,
                      background:`linear-gradient(90deg,${b.zoneColor}20,transparent)`,
                      transition:"width 0.9s ease",pointerEvents:"none",
                    }}/>
                    {/* Rank */}
                    <div style={{width:32,textAlign:"center",flexShrink:0,fontSize:i<3?22:13,
                      color:"rgba(255,200,150,0.4)",fontWeight:700}}>
                      {i<3 ? medals[i] : `#${i+1}`}
                    </div>
                    {/* Info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:b.zoneColor,fontWeight:700,letterSpacing:1,flexShrink:0}}>{b.n}</span>
                        <span style={{fontSize:10,color:"rgba(255,200,150,0.35)",flexShrink:0}}>{b.zoneEmoji} {b.zoneName}</span>
                      </div>
                      <div style={{fontSize:14,fontWeight:700,color:"#fff8e7",margin:"3px 0 2px",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                      <div style={{fontSize:10,color:"rgba(255,200,150,0.4)"}}>{b.item}</div>
                    </div>
                    {/* Bar + votes */}
                    <div style={{flexShrink:0,textAlign:"right"}}>
                      <div style={{fontSize:18,fontWeight:900,color:i===0?"#ffd700":"#fff8e7",
                        animation:"livePulse 2s ease infinite"}}>{b.v.toLocaleString()}</div>
                      <div style={{fontSize:10,color:"rgba(255,200,150,0.35)"}}>票</div>
                      <div style={{marginTop:4,height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,width:60,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:b.zoneColor,borderRadius:2,transition:"width 0.9s ease"}}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stats row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginTop:20}}>
              {[
                {label:"累計投票",value:`${rankings.reduce((s,b)=>s+b.v,0).toLocaleString()}`,unit:"票"},
                {label:"參與攤位",value:"70",unit:"攤"},
                {label:"今日人次",value:"23,847",unit:"人"},
              ].map(s=>(
                <div key={s.label} style={{textAlign:"center",padding:"14px 10px",
                  background:colors.card,border:`1px solid ${colors.border}`,borderRadius:10}}>
                  <div style={{fontSize:"clamp(18px,4vw,24px)",fontWeight:900,color:"#ffd700"}}>{s.value}</div>
                  <div style={{fontSize:10,color:"rgba(255,200,150,0.35)",marginTop:2}}>{s.unit} · {s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
