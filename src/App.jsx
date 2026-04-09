import { useState, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
//  SMARTWIN BET — AI Football Prediction Platform
//  Keys loaded from Vite environment variables (.env file)
// ═══════════════════════════════════════════════════════════════
const FB_BASE = "https://v3.football.api-sports.io";
const FB_KEY  = import.meta.env.VITE_APIFOOTBALL_KEY;
const OD_BASE = "https://api.the-odds-api.com/v4";
const OD_KEY  = import.meta.env.VITE_ODDS_KEY;
const AI_KEY  = import.meta.env.VITE_ANTHROPIC_KEY;
const SZN     = 2025;

// ── 20 TOP LEAGUES ───────────────────────────────────────────
const LEAGUES = [
  { id:39,  name:"Premier League",    f:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", ok:"soccer_epl" },
  { id:140, name:"La Liga",           f:"🇪🇸", ok:"soccer_spain_la_liga" },
  { id:135, name:"Serie A",           f:"🇮🇹", ok:"soccer_italy_serie_a" },
  { id:78,  name:"Bundesliga",        f:"🇩🇪", ok:"soccer_germany_bundesliga" },
  { id:61,  name:"Ligue 1",           f:"🇫🇷", ok:"soccer_france_ligue_one" },
  { id:2,   name:"Champions League",  f:"⭐", ok:"soccer_uefa_champs_league" },
  { id:3,   name:"Europa League",     f:"🟠", ok:"soccer_uefa_europa_league" },
  { id:848, name:"Conference League", f:"🟢", ok:"soccer_uefa_europa_league" },
  { id:40,  name:"Championship",      f:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", ok:"soccer_england_league1" },
  { id:88,  name:"Eredivisie",        f:"🇳🇱", ok:"soccer_netherlands_eredivisie" },
  { id:94,  name:"Primeira Liga",     f:"🇵🇹", ok:"soccer_portugal_primeira_liga" },
  { id:203, name:"Süper Lig",         f:"🇹🇷", ok:"soccer_turkey_super_league" },
  { id:144, name:"Pro League",        f:"🇧🇪", ok:"soccer_belgium_first_div" },
  { id:71,  name:"Brasileirão",       f:"🇧🇷", ok:"soccer_brazil_campeonato" },
  { id:128, name:"Primera División",  f:"🇦🇷", ok:"soccer_argentina_primera_division" },
  { id:307, name:"Saudi Pro League",  f:"🇸🇦", ok:"soccer_saudi_arabias_league" },
  { id:253, name:"MLS",               f:"🇺🇸", ok:"soccer_usa_mls" },
  { id:179, name:"Scottish Prem",     f:"🏴󠁧󠁢󠁳󠁣󠁴󠁿", ok:"soccer_scotland_premiership" },
  { id:141, name:"La Liga 2",         f:"🇪🇸", ok:"soccer_spain_segunda_division" },
  { id:136, name:"Serie B",           f:"🇮🇹", ok:"soccer_italy_serie_b" },
];

const MARKETS = [
  { id:"1x2",             name:"Match Result",    icon:"⚽", desc:"Home / Draw / Away" },
  { id:"goals",           name:"Goals",           icon:"🥅", desc:"Over / Under 2.5" },
  { id:"double_chance",   name:"Double Chance",   icon:"✌️", desc:"1X · X2 · 12" },
  { id:"win_either_half", name:"Win Either Half", icon:"⏱️", desc:"Win 1st or 2nd half" },
  { id:"handicap",        name:"Handicap",        icon:"📊", desc:"Asian Handicap -0.5" },
];

// ══════════════════════════════════════════════════════════════
//  POISSON MATH ENGINE
// ══════════════════════════════════════════════════════════════
const fac = n => { let r=1; for(let i=2;i<=Math.min(n,13);i++) r*=i; return r; };
const P   = (λ,k) => k>13 ? 0 : Math.exp(-λ)*Math.pow(λ,k)/fac(k);

const calcOutcomes = (h,a) => {
  let hw=0,dr=0,aw=0;
  for(let i=0;i<=8;i++) for(let j=0;j<=8;j++){
    const p=P(h,i)*P(a,j); i>j?hw+=p:i===j?dr+=p:aw+=p;
  }
  const t=hw+dr+aw; return{hw:hw/t,dr:dr/t,aw:aw/t};
};
const calcOU = (h,a) => {
  let u=0;
  for(let i=0;i<=10;i++) for(let j=0;j<=10;j++) if(i+j<3) u+=P(h,i)*P(a,j);
  return{over:1-u,under:u};
};
const calcBTTS = (h,a) => (1-P(h,0))*(1-P(a,0));
const calcWEH  = (h,a) => {
  const{hw:h1h,aw:h1a}=calcOutcomes(h*.45,a*.45);
  const{hw:h2h,aw:h2a}=calcOutcomes(h*.55,a*.55);
  return{hWEH:1-(1-h1h)*(1-h2h),aWEH:1-(1-h1a)*(1-h2a)};
};
const calcHCAP = (h,a) => {
  let m05=0;
  for(let i=0;i<=8;i++) for(let j=0;j<=8;j++) if(i-j>0) m05+=P(h,i)*P(a,j);
  return{m05};
};
const implP  = o   => o>1?1/o:0;
const edgeV  = (p,o) => o?+((p-implP(o))*100).toFixed(1):null;
const isVal  = (p,o) => !!o&&p-implP(o)>0.04;
const confOf = p   => {
  if(p>=.72) return{label:"VERY HIGH",col:"#00ff88"};
  if(p>=.60) return{label:"HIGH",     col:"#10b981"};
  if(p>=.50) return{label:"MEDIUM",   col:"#f59e0b"};
  return          {label:"LOW",       col:"#ef4444"};
};

// ══════════════════════════════════════════════════════════════
//  API HELPERS
// ══════════════════════════════════════════════════════════════
const fbGet   = ep => fetch(`${FB_BASE}${ep}`,{headers:{"x-apisports-key":FB_KEY}}).then(r=>r.json());
const getOdds = async ok => {
  try{
    const r=await fetch(`${OD_BASE}/sports/${ok}/odds/?apiKey=${OD_KEY}&regions=eu&markets=h2h,totals&oddsFormat=decimal`);
    return r.ok?r.json():[];
  }catch{return[];}
};

// ── CLAUDE AI ANALYSIS ───────────────────────────────────────
const claudeAI = async (home,away,hw,dr,aw,ou,bt,hxg,axg) => {
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":AI_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:200,
        messages:[{role:"user",content:
          `Expert football analyst. Match: ${home} vs ${away}
Home Win:${(hw*100).toFixed(1)}% | Draw:${(dr*100).toFixed(1)}% | Away:${(aw*100).toFixed(1)}%
xG: ${hxg}(H) vs ${axg}(A) | Over 2.5:${(ou.over*100).toFixed(1)}% | BTTS:${(bt*100).toFixed(1)}%
Write 2 sharp sentences: (1) Key factors driving outcome. (2) Top recommended bet and why. Be specific.`
        }]
      })
    });
    const d=await r.json();
    return d.content?.[0]?.text||"Analysis unavailable.";
  }catch{return"AI analysis unavailable.";}
};

// ══════════════════════════════════════════════════════════════
//  COLOUR TOKENS
// ══════════════════════════════════════════════════════════════
const BG="#050913",CARD="#0c1526",GRN="#10b981",BORD="#162032",TXT="#eef0f4",MUT="#6b7280";

// ══════════════════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════════════════
export default function SmartWinBet(){
  const[view,setView]         = useState("dash");
  const[selLgs,setSelLgs]     = useState([39,140,135,78,2]);
  const[selMks,setSelMks]     = useState(["1x2","goals"]);
  const[maxOdds,setMaxOdds]   = useState(5.0);
  const[valOnly,setValOnly]   = useState(false);
  const[diverse,setDiverse]   = useState(false);
  const[preds,setPreds]       = useState([]);
  const[loading,setLoading]   = useState(false);
  const[msg,setMsg]           = useState("");
  const[expanded,setExpanded] = useState({});
  const[rem,setRem]           = useState(30);
  const[err,setErr]           = useState("");

  useEffect(()=>{
    const l=document.createElement("link");
    l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  },[]);

  const today=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const togLg=id=>setSelLgs(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const togMk=id=>setSelMks(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const togEx=id=>setExpanded(p=>({...p,[id]:!p[id]}));

  // ── GENERATE ──────────────────────────────────────────────
  const generate=useCallback(async()=>{
    if(rem<=0){setErr("Daily limit reached. Resets tomorrow.");return;}
    if(!selLgs.length){setErr("Select at least 1 league.");return;}
    if(!selMks.length){setErr("Select at least 1 market.");return;}
    setErr("");setLoading(true);setPreds([]);
    const results=[];
    const dateStr=new Date().toISOString().split("T")[0];

    for(const lid of selLgs){
      const league=LEAGUES.find(l=>l.id===lid);
      try{
        setMsg(`📡 ${league.name} — fetching fixtures...`);
        const fx=await fbGet(`/fixtures?league=${lid}&season=${SZN}&date=${dateStr}`);
        const fixes=fx.response||[];
        if(!fixes.length) continue;

        setMsg(`💰 ${league.name} — loading live odds...`);
        const oddsData=await getOdds(league.ok);

        for(const fix of fixes.slice(0,2)){
          const hId=fix.teams.home.id,aId=fix.teams.away.id;
          setMsg(`⚙️ Modeling: ${fix.teams.home.name} vs ${fix.teams.away.name}`);

          const[hS,aS]=await Promise.all([
            fbGet(`/teams/statistics?league=${lid}&season=${SZN}&team=${hId}`),
            fbGet(`/teams/statistics?league=${lid}&season=${SZN}&team=${aId}`),
          ]);

          const hGF=+(hS.response?.goals?.for?.average?.home  ||1.45);
          const hGA=+(hS.response?.goals?.against?.average?.home||1.10);
          const aGF=+(aS.response?.goals?.for?.average?.away  ||1.10);
          const aGA=+(aS.response?.goals?.against?.average?.away||1.45);
          const hxg=Math.max(0.40,(hGF*aGA)/1.32);
          const axg=Math.max(0.40,(aGF*hGA)/1.32);

          const oc=calcOutcomes(hxg,axg);
          const ou=calcOU(hxg,axg);
          const bt=calcBTTS(hxg,axg);
          const wh=calcWEH(hxg,axg);
          const hc=calcHCAP(hxg,axg);
          const dc={hd:oc.hw+oc.dr,ad:oc.aw+oc.dr,ha:oc.hw+oc.aw};

          const key=fix.teams.home.name.toLowerCase().split(" ")[0];
          const om=oddsData?.find?.(g=>g.home_team?.toLowerCase().includes(key)||g.away_team?.toLowerCase().includes(key));
          const h2hM=om?.bookmakers?.[0]?.markets?.find(m=>m.key==="h2h");
          const totM=om?.bookmakers?.[0]?.markets?.find(m=>m.key==="totals");
          const bk={
            h  :h2hM?.outcomes?.find(o=>o.name===om?.home_team)?.price,
            d  :h2hM?.outcomes?.find(o=>o.name==="Draw")?.price,
            a  :h2hM?.outcomes?.find(o=>o.name===om?.away_team)?.price,
            o25:totM?.outcomes?.find(o=>o.name==="Over")?.price,
            u25:totM?.outcomes?.find(o=>o.name==="Under")?.price,
          };

          const mPreds=[];

          if(selMks.includes("1x2")){
            const b=oc.hw>=oc.aw&&oc.hw>=oc.dr?{t:`${fix.teams.home.name} Win`,p:oc.hw,o:bk.h}:oc.aw>=oc.hw&&oc.aw>=oc.dr?{t:`${fix.teams.away.name} Win`,p:oc.aw,o:bk.a}:{t:"Draw",p:oc.dr,o:bk.d};
            const e=edgeV(b.p,b.o);
            if(!valOnly||isVal(b.p,b.o)) mPreds.push({market:"Match Result",icon:"⚽",pick:b.t,prob:b.p,odds:b.o,edge:e,val:isVal(b.p,b.o),conf:confOf(b.p)});
          }
          if(selMks.includes("goals")){
            const b=ou.over>=0.5?{t:"Over 2.5 Goals",p:ou.over,o:bk.o25}:{t:"Under 2.5 Goals",p:ou.under,o:bk.u25};
            const e=edgeV(b.p,b.o);
            if(!valOnly||isVal(b.p,b.o)) mPreds.push({market:"Goals",icon:"🥅",pick:b.t,prob:b.p,odds:b.o,edge:e,val:isVal(b.p,b.o),conf:confOf(b.p),btts:bt});
          }
          if(selMks.includes("double_chance")){
            const b=dc.hd>=dc.ad&&dc.hd>=dc.ha?{t:`${fix.teams.home.name} or Draw (1X)`,p:dc.hd}:dc.ad>=dc.hd?{t:`${fix.teams.away.name} or Draw (X2)`,p:dc.ad}:{t:"No Draw (12)",p:dc.ha};
            mPreds.push({market:"Double Chance",icon:"✌️",pick:b.t,prob:b.p,odds:null,edge:null,val:false,conf:confOf(b.p)});
          }
          if(selMks.includes("win_either_half")){
            const b=wh.hWEH>=wh.aWEH?{t:`${fix.teams.home.name} Win Either Half`,p:wh.hWEH}:{t:`${fix.teams.away.name} Win Either Half`,p:wh.aWEH};
            mPreds.push({market:"Win Either Half",icon:"⏱️",pick:b.t,prob:b.p,odds:null,edge:null,val:false,conf:confOf(b.p)});
          }
          if(selMks.includes("handicap")){
            const b=hc.m05>=0.5?{t:`${fix.teams.home.name} -0.5 AH`,p:hc.m05}:{t:`${fix.teams.away.name} +0.5 AH`,p:1-hc.m05};
            mPreds.push({market:"Handicap",icon:"📊",pick:b.t,prob:b.p,odds:null,edge:null,val:false,conf:confOf(b.p)});
          }

          let fp=mPreds.filter(p=>!p.odds||p.odds<=maxOdds);
          if(diverse&&fp.length>1){const s=new Set();fp=fp.filter(p=>{if(s.has(p.market))return false;s.add(p.market);return true;});}
          if(!fp.length) continue;

          setMsg(`🧠 AI analyzing ${fix.teams.home.name} vs ${fix.teams.away.name}...`);
          const ai=await claudeAI(fix.teams.home.name,fix.teams.away.name,oc.hw,oc.dr,oc.aw,ou,bt,hxg.toFixed(2),axg.toFixed(2));

          results.push({
            id:fix.fixture.id,
            home:fix.teams.home.name, homeLogo:fix.teams.home.logo,
            away:fix.teams.away.name, awayLogo:fix.teams.away.logo,
            ko:new Date(fix.fixture.date).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),
            league:league.name, flag:league.f,
            hxg:hxg.toFixed(2), axg:axg.toFixed(2),
            preds:fp, ai,
          });
        }
      }catch(e){console.error(`League ${lid}:`,e);}
    }

    setRem(r=>Math.max(0,r-1));
    setPreds(results);setLoading(false);setMsg("");
    if(results.length>0) setView("picks");
    else setErr("No fixtures found today. Try different leagues or check tomorrow.");
  },[selLgs,selMks,maxOdds,valOnly,diverse,rem]);

  // ── SHARED STYLES ─────────────────────────────────────────
  const S={
    page :{background:BG,minHeight:"100vh",color:TXT,fontFamily:"'Barlow',sans-serif",maxWidth:480,margin:"0 auto",paddingBottom:84},
    hdr  :{background:"linear-gradient(180deg,#0c1b35,#050913)",padding:"13px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${BORD}`,position:"sticky",top:0,zIndex:100},
    card :{background:CARD,border:`1px solid ${BORD}`,borderRadius:14,padding:14,marginBottom:10},
    btn  :{background:GRN,color:"#000",border:"none",borderRadius:12,padding:"15px",fontWeight:900,fontSize:16,cursor:"pointer",width:"100%",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:.8},
    tog  :{width:48,height:26,borderRadius:13,position:"relative",cursor:"pointer",flexShrink:0,transition:"background .2s"},
    dot  :{position:"absolute",top:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"},
    pill :{padding:"5px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:.5},
    nav  :{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#0a1121",borderTop:`1px solid ${BORD}`,display:"flex",zIndex:200},
    navB :{flex:1,padding:"10px 0",background:"none",border:"none",cursor:"pointer",fontSize:9,display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:.8},
  };

  // ── LOADING ───────────────────────────────────────────────
  if(loading) return(
    <div style={{...S.page,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
      <div style={{position:"relative",width:80,height:80,marginBottom:28}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:`3px solid ${BORD}`,borderTopColor:GRN,animation:"spin 1s linear infinite"}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,animation:"float 2s ease-in-out infinite"}}>⚽</div>
      </div>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:24,fontWeight:900,letterSpacing:2,marginBottom:10}}>GENERATING PREDICTIONS</div>
      <div style={{fontSize:13,color:GRN,textAlign:"center",padding:"0 30px",lineHeight:1.9,minHeight:44}}>{msg}</div>
      <div style={{display:"flex",gap:8,marginTop:24}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:GRN,animation:`pulse 1.2s ${i*.4}s ease-in-out infinite`}}/>)}
      </div>
    </div>
  );

  // ── DASHBOARD ─────────────────────────────────────────────
  const Dash=()=>(
    <div style={{padding:"0 16px"}}>
      <div style={{padding:"20px 0 16px"}}>
        <div style={{color:MUT,fontSize:12,marginBottom:4}}>{today}</div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900}}>Good day, Champion 🏆</div>
      </div>
      <button style={S.btn} onClick={()=>setView("filters")}>✦ View Accumulators →</button>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}>
        {[["📊","TOTAL ACCAS","559+"],["🏆","WIN RATE","29%"],["🎯","PICK ACCURACY","83.9%"],["🔥","BEST HIT","18.14x"]].map(([ic,lb,vl])=>(
          <div key={lb} style={S.card}>
            <div style={{fontSize:20,marginBottom:8}}>{ic}</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:32,fontWeight:900,lineHeight:1}}>{vl}</div>
            <div style={{fontSize:10,color:MUT,letterSpacing:1.2,marginTop:5,textTransform:"uppercase"}}>{lb}</div>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={{fontSize:10,color:MUT,letterSpacing:1.5,textTransform:"uppercase",marginBottom:16,fontWeight:700}}>Win Rate By Size</div>
        {[["3-leg","62%",.62,GRN],["5-leg","45%",.45,GRN],["10-leg","18%",.18,"#f59e0b"],["15-leg","7%",.07,"#ef4444"]].map(([l,v,w,c])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:50,fontSize:12,color:"#9ca3af",fontWeight:600,fontFamily:"'Barlow Condensed',sans-serif"}}>{l}</div>
            <div style={{flex:1,background:"#162032",borderRadius:4,height:8,overflow:"hidden"}}>
              <div style={{width:`${w*100}%`,background:c,height:"100%",borderRadius:4}}/>
            </div>
            <div style={{width:36,fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,fontWeight:800,textAlign:"right",color:c}}>{v}</div>
          </div>
        ))}
        <div style={{fontSize:11,color:MUT,marginTop:6}}>💡 Strongest results: 3–5 leg accas</div>
      </div>
      {preds.length>0&&(
        <button style={{...S.btn,background:"#0d1a2e",color:GRN,border:`1px solid ${GRN}40`,marginTop:2}} onClick={()=>setView("picks")}>
          View {preds.length} Active Predictions →
        </button>
      )}
    </div>
  );

  // ── FILTERS ───────────────────────────────────────────────
  const Filters=()=>(
    <div style={{padding:"0 16px"}}>
      <div style={{padding:"20px 0 14px",fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900}}>⚙️ Advanced Filters</div>
      {err&&<div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:10,padding:"10px 14px",marginBottom:12,color:"#ef4444",fontSize:13}}>{err}</div>}
      <div style={S.card}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,marginBottom:10}}>
          🌍 Leagues <span style={{color:GRN,fontSize:13,fontWeight:600}}>({selLgs.length} selected)</span>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {LEAGUES.map(l=>(
            <button key={l.id} onClick={()=>togLg(l.id)} style={{...S.pill,background:selLgs.includes(l.id)?GRN:"#162032",color:selLgs.includes(l.id)?"#000":"#9ca3af"}}>
              {l.f} {l.name}
            </button>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,marginBottom:10}}>📈 Markets</div>
        {MARKETS.map(m=>(
          <div key={m.id} onClick={()=>togMk(m.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 0",borderBottom:`1px solid ${BORD}`,cursor:"pointer"}}>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>{m.icon} {m.name}</div>
              <div style={{fontSize:11,color:MUT,marginTop:2}}>{m.desc}</div>
            </div>
            <div style={{...S.tog,background:selMks.includes(m.id)?GRN:"#2a3548"}}>
              <div style={{...S.dot,left:selMks.includes(m.id)?25:3}}/>
            </div>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16}}>Max Odds</div>
          <div style={{color:GRN,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22}}>{maxOdds.toFixed(2)}</div>
        </div>
        <div style={{fontSize:12,color:MUT,marginBottom:10}}>Exclude high-odds selections</div>
        <input type="range" min="1.10" max="10.0" step="0.05" value={maxOdds}
          onChange={e=>setMaxOdds(+e.target.value)}
          style={{width:"100%",accentColor:GRN,cursor:"pointer"}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#4b5563",marginTop:4}}>
          <span>1.10</span><span>10.00</span>
        </div>
      </div>
      {[
        {label:"Value Edge",      desc:"Only show value bets vs bookmaker", val:valOnly,set:setValOnly},
        {label:"Market Diversity",desc:"Unique markets per accumulator",    val:diverse,set:setDiverse},
      ].map(f=>(
        <div key={f.label} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15}}>{f.label}</div>
              <div style={{fontSize:11,color:MUT,marginTop:3}}>{f.desc}</div>
            </div>
            <div onClick={()=>f.set(!f.val)} style={{...S.tog,background:f.val?GRN:"#2a3548"}}>
              <div style={{...S.dot,left:f.val?25:3}}/>
            </div>
          </div>
        </div>
      ))}
      <button onClick={generate} disabled={rem<=0} style={{...S.btn,opacity:rem>0?1:.45,marginTop:4}}>
        ✦ Generate Predictions · {rem}/30 Remaining
      </button>
    </div>
  );

  // ── PREDICTION CARD ───────────────────────────────────────
  const PCard=({m})=>{
    const open=expanded[m.id];
    return(
      <div style={{...S.card,marginBottom:12,borderColor:open?`${GRN}40`:BORD}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,color:GRN,fontWeight:700}}>{m.flag} {m.league}</div>
          <div style={{background:"#162032",borderRadius:6,padding:"3px 10px",fontSize:12,color:"#9ca3af",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700}}>{m.ko}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{textAlign:"center",flex:1}}>
            <img src={m.homeLogo} alt="" width={40} height={40} style={{objectFit:"contain",display:"block",margin:"0 auto 6px"}} onError={e=>e.target.style.display="none"}/>
            <div style={{fontWeight:700,fontSize:13,lineHeight:1.2}}>{m.home}</div>
          </div>
          <div style={{textAlign:"center",padding:"0 10px"}}>
            <div style={{background:"#111d30",borderRadius:10,padding:"6px 12px",border:`1px solid ${BORD}`}}>
              <div style={{fontSize:8,color:MUT,letterSpacing:1.5,marginBottom:2}}>xG</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:15}}>{m.hxg} – {m.axg}</div>
            </div>
          </div>
          <div style={{textAlign:"center",flex:1}}>
            <img src={m.awayLogo} alt="" width={40} height={40} style={{objectFit:"contain",display:"block",margin:"0 auto 6px"}} onError={e=>e.target.style.display="none"}/>
            <div style={{fontWeight:700,fontSize:13,lineHeight:1.2}}>{m.away}</div>
          </div>
        </div>
        {m.preds.map((p,i)=>(
          <div key={i} style={{background:"#060c1a",borderRadius:10,padding:"10px 12px",marginBottom:6,border:`1px solid ${p.val?"rgba(16,185,129,.35)":BORD}`,boxShadow:p.val?"0 0 14px rgba(16,185,129,.07)":"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <div style={{fontSize:10,color:MUT,fontWeight:600,letterSpacing:.8,textTransform:"uppercase"}}>{p.icon} {p.market}</div>
              <div style={{display:"flex",gap:5}}>
                {p.val&&<span style={{background:"rgba(16,185,129,.12)",color:GRN,borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:800,border:`1px solid ${GRN}40`}}>VALUE</span>}
                <span style={{background:"rgba(0,0,0,.4)",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:800,color:p.conf.col}}>{p.conf.label}</span>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16}}>{p.pick}</div>
              <div style={{textAlign:"right"}}>
                {p.odds&&<div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,color:GRN,fontSize:20,lineHeight:1}}>{p.odds.toFixed(2)}</div>}
                <div style={{fontSize:12,color:"#9ca3af",fontWeight:600}}>{(p.prob*100).toFixed(1)}%</div>
              </div>
            </div>
            {p.edge!==null&&p.odds&&<div style={{fontSize:11,marginTop:5,color:p.edge>0?GRN:"#ef4444",fontWeight:700}}>Edge: {p.edge>0?"+":""}{p.edge}%</div>}
            {p.btts!==undefined&&<div style={{fontSize:11,color:MUT,marginTop:3}}>BTTS: {(p.btts*100).toFixed(1)}%</div>}
          </div>
        ))}
        <div style={{borderTop:`1px solid ${BORD}`,marginTop:8}}>
          <div onClick={()=>togEx(m.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",cursor:"pointer"}}>
            <div style={{fontSize:12,color:GRN,fontWeight:700}}>🧠 AI Analysis</div>
            <div style={{color:MUT,fontWeight:700}}>{open?"▲":"▼"}</div>
          </div>
          {open&&<div style={{fontSize:13,color:"#c8d0dc",lineHeight:1.8,paddingBottom:6,borderTop:`1px solid ${BORD}`,paddingTop:10}}>{m.ai}</div>}
        </div>
      </div>
    );
  };

  // ── PICKS ─────────────────────────────────────────────────
  const Picks=()=>(
    <div style={{padding:"0 16px"}}>
      <div style={{padding:"20px 0 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900}}>⚽ Today's Picks</div>
        <div style={{color:GRN,fontWeight:700,fontSize:13}}>{preds.length} matches</div>
      </div>
      {!preds.length?(
        <div style={{textAlign:"center",padding:"60px 20px",color:MUT}}>
          <div style={{fontSize:52,marginBottom:16}}>⚽</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,marginBottom:8,color:TXT}}>No Predictions Yet</div>
          <div style={{fontSize:13,marginBottom:24,lineHeight:1.6}}>Head to Filters and generate today's predictions</div>
          <button style={S.btn} onClick={()=>setView("filters")}>Generate Now →</button>
        </div>
      ):preds.map(m=><PCard key={m.id} m={m}/>)}
    </div>
  );

  // ── ROOT ──────────────────────────────────────────────────
  return(
    <div style={S.page}>
      <style>{`input[type=range]::-webkit-slider-thumb{background:${GRN};border:none;width:18px;height:18px;border-radius:50%;}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}`}</style>
      <div style={S.hdr}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:21,fontWeight:900,letterSpacing:1}}>
          SMARTWIN<span style={{color:GRN}}>BET</span>
          <span style={{fontSize:9,color:MUT,letterSpacing:2,marginLeft:6,verticalAlign:"middle"}}>AI</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{background:rem>0?GRN:"#2a3548",color:rem>0?"#000":MUT,borderRadius:20,padding:"4px 12px",fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:800}}>⚡ {rem}/30</div>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#162032",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,cursor:"pointer"}}>🔔</div>
        </div>
      </div>
      {view==="dash"    && <Dash/>}
      {view==="filters" && <Filters/>}
      {view==="picks"   && <Picks/>}
      <div style={S.nav}>
        {[["dash","🏠","Home"],["filters","⚙️","Filters"],["picks","⚽","Picks"]].map(([v,ic,lb])=>(
          <button key={v} style={{...S.navB,color:view===v?GRN:MUT}} onClick={()=>setView(v)}>
            <span style={{fontSize:22}}>{ic}</span>
            <span style={{fontWeight:view===v?800:400,textTransform:"uppercase"}}>{lb}</span>
            {view===v&&<div style={{width:20,height:2,borderRadius:1,background:GRN}}/>}
          </button>
        ))}
      </div>
    </div>
  );
}
