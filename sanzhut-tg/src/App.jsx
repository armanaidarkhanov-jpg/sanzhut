import { useState, useRef } from "react";

/* ─── CONSTANTS ─────────────────────────────────────────── */
const SUITS    = ['♠','♥','♦','♣'];
const REG_VALS = ['4','5','6','7','8','9','10','J','Q','K','A','2','3'];
const LV_ORDER = REG_VALS;
const CHAM_OK  = REG_VALS.filter(v=>!['2','3'].includes(v));
const RED_SUITS= new Set(['♥','♦']);
const P_COLORS = ['#e05c5c','#5b9cf6','#52c97a','#f0a24a'];
const P_NAMES  = ['Игрок 1','Игрок 2','Игрок 3','Игрок 4'];
const SEQ_BAD  = new Set(['2','3','JB','JR']);
const CLABELS  = {single:'Одна карта',pair:'Пара',small_bomb:'Малая бомба',
  big_bomb:'Большая бомба',hatar:'Хатар',sanzhut:'Санжут'};

const VR={};
REG_VALS.forEach((v,i)=>VR[v]=i);
VR['JB']=13; VR['JR']=14;

const getLV = idx=>LV_ORDER[Math.max(0,Math.min(idx,LV_ORDER.length-1))];
const advLV = (idx,ct)=>Math.min(idx+({single:1,pair:2,small_bomb:3,big_bomb:4}[ct]||0),LV_ORDER.length-1);
const rvOf  = (c,cv)=>c.type==='chameleon'?(cv||'4'):c.value;

/* ─── DECK ───────────────────────────────────────────────── */
function createDeck(){
  let id=0,cards=[];
  for(const s of SUITS) for(const v of REG_VALS)
    cards.push({id:id++,value:v,suit:s,type:'regular',isSpade4:v==='4'&&s==='♠'});
  cards.push({id:id++,value:'JB',suit:null,type:'joker_black',isSpade4:false});
  cards.push({id:id++,value:'JR',suit:null,type:'joker_red',  isSpade4:false});
  cards.push({id:id++,value:'CH',suit:null,type:'chameleon',  isSpade4:false});
  return cards;
}
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
const deal=cards=>{const h=[[],[],[],[]];cards.forEach((c,i)=>h[i%4].push(c));return h;};
const SUIT_O={'♠':0,'♥':1,'♦':2,'♣':3};

function autoSortIds(cards){
  return [...cards].sort((a,b)=>{
    const ra=a.type==='chameleon'?16:a.type==='joker_red'?15:a.type==='joker_black'?14:(VR[a.value]??0);
    const rb=b.type==='chameleon'?16:b.type==='joker_red'?15:b.type==='joker_black'?14:(VR[b.value]??0);
    return ra!==rb?ra-rb:(SUIT_O[a.suit]??0)-(SUIT_O[b.suit]??0);
  }).map(c=>c.id);
}

/* ─── COMBO DETECTION ────────────────────────────────────── */
function detectCombo(cards,cv=null){
  if(!cards?.length) return null;
  const n=cards.length;
  const res=cards.map(c=>({...c,rv:rvOf(c,cv)}));
  const ranks=res.map(c=>VR[c.rv]??-1);
  const hasCh=cards.some(c=>c.type==='chameleon');
  const nonCh=res.filter(c=>c.type!=='chameleon');
  const ncR=nonCh.map(c=>VR[c.rv]??-1);
  const allSame=()=>ranks.every(r=>r===ranks[0]);
  if(n===1) return{type:'single',rank:ranks[0]};
  if(n===2){
    if(allSame()) return{type:'pair',rank:ranks[0]};
    if(hasCh&&ncR.length===1) return{type:'pair',rank:ncR[0]};
  }
  if(n===3){
    if(allSame()) return{type:'small_bomb',rank:ranks[0]};
    if(hasCh&&new Set(ncR).size===1&&ncR.length===2) return{type:'small_bomb',rank:ncR[0]};
  }
  if(n===4){
    if(allSame()) return{type:'big_bomb',rank:ranks[0]};
    if(hasCh&&new Set(ncR).size===1&&ncR.length===3) return{type:'big_bomb',rank:ncR[0]};
  }
  if(n>=4){const h=chkHatar(res,hasCh,n);if(h) return h;}
  if(n>=6&&n%2===0){const s=chkSanzhut(res,n);if(s) return s;}
  return null;
}
function chkHatar(res,hasCh,n){
  const nonCh=res.filter(c=>c.type!=='chameleon');
  if(nonCh.some(c=>SEQ_BAD.has(c.rv))) return null;
  const ncR=[...new Set(nonCh.map(c=>VR[c.rv]??-1))].sort((a,b)=>a-b);
  if(ncR.length!==nonCh.length) return null;
  if(!hasCh){
    if(ncR[ncR.length-1]-ncR[0]===n-1) return{type:'hatar',length:n,rank:ncR[0]};
  } else {
    const span=ncR[ncR.length-1]-ncR[0]+1,gaps=span-nonCh.length;
    if(gaps===1&&span===n) return{type:'hatar',length:n,rank:ncR[0]};
    if(gaps===0&&nonCh.length===n-1) return{type:'hatar',length:n,rank:ncR[0]>0?ncR[0]-1:ncR[0]};
  }
  return null;
}
function chkSanzhut(res,n){
  const nonCh=res.filter(c=>c.type!=='chameleon');
  if(nonCh.some(c=>SEQ_BAD.has(c.rv))) return null;
  const vc={};nonCh.forEach(c=>{vc[c.rv]=(vc[c.rv]||0)+1;});
  const vals=Object.keys(vc);
  if(vals.some(v=>vc[v]!==2)) return null;
  const rk=vals.map(v=>VR[v]).sort((a,b)=>a-b);
  const pairs=n/2;
  if(rk[rk.length-1]-rk[0]===pairs-1&&rk.length===pairs) return{type:'sanzhut',pairs,rank:rk[0]};
  return null;
}

/* ─── CAN BEAT ───────────────────────────────────────────── */
function canBeat(played,table){
  if(!table) return true;
  const{type:pt,rank:pr,length:pl,pairs:pp}=played;
  const{type:tt,rank:tr,length:tl,pairs:tp}=table;
  if(pt==='big_bomb') return tt==='big_bomb'?pr>tr:true;
  if(tt==='single'&&tr===VR['JR']) return false;
  if(pt==='small_bomb'){
    if(tt==='single') return true;
    if(tt==='pair')   return true;
    if(tt==='hatar')  return true;
    if(tt==='small_bomb') return pr>tr;
    return false;
  }
  if(pt===tt){
    if(['single','pair','small_bomb','big_bomb'].includes(pt)) return pr>tr;
    if(pt==='hatar')   return pl===tl&&pr>tr;
    if(pt==='sanzhut') return pp===tp&&pr>tr;
  }
  return false;
}

/* ─── INIT ───────────────────────────────────────────────── */
// prevLevels: carry over from previous game (Feature #2)
function initGame(prevLevels=[0,0,0,0]){
  const deck=shuffle(createDeck()),hands=deal(deck);
  let first=0;
  for(let i=0;i<4;i++) if(hands[i].some(c=>c.isSpade4)){first=i;break;}
  // handOrders: custom card order per player (Feature #1)
  const handOrders={};
  hands.forEach((h,i)=>{ handOrders[i]=autoSortIds(h); });
  return{
    hands,levels:[...prevLevels],currentPlayer:first,
    table:null,selected:[],chamVal:null,
    log:[`${P_NAMES[first]} ходит первым (4♠)`],
    finished:[],phase:'playing',passStreak:0,
    handOrders
  };
}

/* ─── CARD VISUAL ────────────────────────────────────────── */
function CardFace({card,sel,onClick,sm,levelVal,dragHandlers,isDragOver}){
  let top,bot,color,bg,bord;
  if(card.type==='joker_black'){
    top='🃏';bot='B';color='#222';
    bg='linear-gradient(145deg,#e8e8e8,#ccc)';bord='#888';
  } else if(card.type==='joker_red'){
    top='🃏';bot='R';color='#8b0000';
    bg='linear-gradient(145deg,#ffe0e0,#ffb0b0)';bord='#cc4444';
  } else if(card.type==='chameleon'){
    top='✦';bot='CH';color='#6a0dad';
    bg='linear-gradient(145deg,#f3e6ff,#ddb8ff)';bord='#9b59b6';
  } else {
    top=card.value; bot=card.suit;
    const red=RED_SUITS.has(card.suit);
    color=red?'#b91c1c':'#1a1a2e';
    bg='linear-gradient(145deg,#fffef8,#faf4e0)';
    bord=red?'#e8b4b4':'#c8c4a8';
  }
  const isLv=card.value===levelVal&&card.type==='regular'&&!sm;
  const W=sm?40:56,H=sm?56:80;
  return(
    <div
      onClick={onClick}
      {...(dragHandlers||{})}
      style={{
        width:W,height:H,background:bg,
        border:`2px solid ${isDragOver?'#60a5fa':sel?'#f0c040':isLv?'#52c97a':bord}`,
        borderRadius:sm?6:9,display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',
        cursor:dragHandlers?'grab':onClick?'pointer':'default',
        transform:sel?'translateY(-16px) scale(1.06)':isDragOver?'scale(1.08)':'none',
        transition:'transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s,border-color .15s',
        boxShadow:isDragOver
          ?'0 0 0 2px #60a5fa, 0 8px 24px rgba(96,165,250,.4)'
          :sel
            ?'0 12px 30px rgba(240,192,64,.5),0 0 0 1px rgba(240,192,64,.4)'
            :isLv?'0 3px 10px rgba(82,201,122,.3)':'0 3px 8px rgba(0,0,0,.3)',
        color,fontWeight:'bold',userSelect:'none',flexShrink:0,
        position:'relative',fontFamily:"'Georgia',serif",
        opacity:dragHandlers&&dragHandlers['data-dragging']?0.4:1,
      }}>
      {isLv&&<div style={{position:'absolute',top:3,right:3,width:7,height:7,
        borderRadius:'50%',background:'#52c97a',boxShadow:'0 0 8px #52c97a88'}}/>}
      <div style={{fontSize:sm?11:top.length>1?12:18,lineHeight:1.1,fontWeight:'900'}}>{top}</div>
      {bot&&<div style={{fontSize:sm?10:13,lineHeight:1,opacity:.9}}>{bot}</div>}
    </div>
  );
}

/* ─── PLAYER BADGE ───────────────────────────────────────── */
function PlayerBadge({idx,level,cardCount,active,done,color}){
  return(
    <div style={{
      flex:1,borderRadius:10,padding:'8px 4px',textAlign:'center',
      background:active?`linear-gradient(160deg,${color}18,${color}06)`:'rgba(255,255,255,.03)',
      border:`1.5px solid ${active?color:done?color+'55':'rgba(255,255,255,.06)'}`,
      opacity:done?.5:1,transition:'all .3s',position:'relative',overflow:'hidden',
    }}>
      {active&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,
        background:`linear-gradient(90deg,transparent,${color},transparent)`,
        animation:'pulse 2s infinite'}}/>}
      <div style={{fontSize:9,color,fontWeight:'bold',letterSpacing:.5,marginBottom:1}}>
        И{idx+1} {done?'✓':active?'▶':''}
      </div>
      <div style={{fontSize:24,color:'#f0c040',fontWeight:'bold',lineHeight:1.1,
        textShadow:active?`0 0 20px ${color}66`:'none'}}>
        {getLV(level)}
      </div>
      <div style={{fontSize:10,color:'rgba(255,255,255,.2)',marginTop:1}}>{cardCount}к</div>
    </div>
  );
}

/* ─── APP ────────────────────────────────────────────────── */
export default function App(){
  // Feature #2: persist levels across games
  const [globalLevels,setGlobalLevels]=useState([0,0,0,0]);
  const [gs,setGs]=useState(()=>initGame([0,0,0,0]));
  const [badAnim,setBadAnim]=useState(false);
  // Feature #1: arrange mode per player
  const [arrangeMode,setArrangeMode]=useState(false);
  const dragIdx=useRef(null);
  const [dragOverIdx,setDragOverIdx]=useState(null);

  const{hands,levels,currentPlayer,table,selected,chamVal,log,finished,phase,passStreak,handOrders}=gs;

  // Build the ordered hand for the current player
  const allCards=hands[currentPlayer]||[];
  const order=handOrders[currentPlayer]||autoSortIds(allCards);
  // Only show cards that still exist in hand
  const existingIds=new Set(allCards.map(c=>c.id));
  const cardById=Object.fromEntries(allCards.map(c=>[c.id,c]));
  const curHand=order.filter(id=>existingIds.has(id)).map(id=>cardById[id]);

  const curLV=getLV(levels[currentPlayer]);
  const isSel=c=>selected.some(s=>s.id===c.id);
  const hasChamSel=selected.some(c=>c.type==='chameleon');
  const curCombo=selected.length>0?detectCombo(selected,chamVal):null;
  const canPlayIt=!!(curCombo&&(!table||canBeat(curCombo,table.combo)));
  const canPassIt=!!(table&&table.playedBy!==currentPlayer);

  function upd(fn){setGs(p=>({...p,...fn(p)}));}
  function bad(){setBadAnim(true);setTimeout(()=>setBadAnim(false),400);}

  function nextActive(from,fins){
    let n=(from+1)%4,t=0;
    while(fins.includes(n)&&t<4){n=(n+1)%4;t++;}
    return n;
  }

  /* ─── DRAG REORDER (Feature #1) ─── */
  function onDragStart(idx){
    dragIdx.current=idx;
  }
  function onDragOver(e,idx){
    e.preventDefault();
    setDragOverIdx(idx);
  }
  function onDrop(e,toIdx){
    e.preventDefault();
    const fromIdx=dragIdx.current;
    if(fromIdx===null||fromIdx===toIdx){setDragOverIdx(null);return;}
    upd(g=>{
      const order=[...(g.handOrders[currentPlayer]||autoSortIds(g.hands[currentPlayer]))];
      // filter only existing cards
      const existing=new Set((g.hands[currentPlayer]||[]).map(c=>c.id));
      const filtered=order.filter(id=>existing.has(id));
      const item=filtered.splice(fromIdx,1)[0];
      filtered.splice(toIdx,0,item);
      return{handOrders:{...g.handOrders,[currentPlayer]:filtered}};
    });
    dragIdx.current=null;
    setDragOverIdx(null);
  }
  function onDragEnd(){dragIdx.current=null;setDragOverIdx(null);}

  function resetOrder(){
    upd(g=>({handOrders:{...g.handOrders,
      [currentPlayer]:autoSortIds(g.hands[currentPlayer]||[])}}));
  }

  /* ─── PLAY ─── */
  function playCards(){
    upd(g=>{
      const{hands,levels,currentPlayer:cp,table,selected,chamVal,log,finished}=g;
      if(!selected.length) return{};
      if(selected.some(c=>c.type==='chameleon')&&!chamVal){bad();return{};}
      const combo=detectCombo(selected,chamVal);
      if(!combo){bad();return{};}
      if(table&&!canBeat(combo,table.combo)){bad();return{};}
      const nH=hands.map((h,i)=>i===cp?h.filter(c=>!selected.some(s=>s.id===c.id)):h);
      const nL=[...levels],nLog=[...log],nFin=[...finished];
      let nPhase=g.phase;
      if(nH[cp].length===0){
        nFin.push(cp);
        const is44=combo.type==='pair'&&selected.every(c=>rvOf(c,chamVal)==='4');
        if(is44){
          if(levels[cp]===0){nL[cp]=2;nLog.push(`${P_NAMES[cp]} вышел с 4-4! → уровень 6`);}
          else{[0,1,2,3].forEach(i=>{if(i!==cp&&!nFin.includes(i))nL[i]=Math.max(0,nL[i]-1);});nLog.push(`${P_NAMES[cp]} вышел с 4-4! Все -1 уровень`);}
        } else {
          const hasLv=selected.some(c=>rvOf(c,chamVal)===getLV(levels[cp]));
          if(hasLv){nL[cp]=advLV(levels[cp],combo.type);nLog.push(`${P_NAMES[cp]} вышел с ${getLV(levels[cp])}! → ${getLV(nL[cp])}`);}
          else nLog.push(`${P_NAMES[cp]} вышел (уровень без изменений)`);
        }
        if([0,1,2,3].filter(i=>!nFin.includes(i)).length<=1){
          nPhase='finished';
          nLog.push('🏆 Партия окончена!');
          // Feature #2: save final levels so next game can use them
          setGlobalLevels([...nL]);
        }
      } else {
        const myLV=getLV(levels[cp]);
        if(selected.some(c=>rvOf(c,chamVal)===myLV)){
          const left=nH[cp].filter(c=>c.value===myLV&&c.type==='regular').length;
          if(left===0){nL[cp]=Math.max(0,nL[cp]-1);nLog.push(`${P_NAMES[cp]} потратил все ${myLV}! -1 уровень`);}
        }
        nLog.push(`${P_NAMES[cp]}: ${selected.length}к [${CLABELS[combo.type]}]`);
      }
      const nx=nextActive(cp,nFin);
      return{hands:nH,levels:nL,currentPlayer:nx,
        table:{cards:selected,combo,playedBy:cp},
        selected:[],chamVal:null,log:nLog.slice(-12),
        finished:nFin,phase:nPhase,passStreak:0};
    });
    setArrangeMode(false);
  }

  /* ─── PASS ─── */
  function pass(){
    upd(g=>{
      const{currentPlayer:cp,table,log,finished,passStreak}=g;
      const nLog=[...log,`${P_NAMES[cp]} пасует`];
      const newStreak=passStreak+1;
      const active=[0,1,2,3].filter(i=>!finished.includes(i));
      const needed=table?active.filter(i=>i!==table.playedBy).length:0;
      const nx=nextActive(cp,finished);
      if(newStreak>=needed){
        return{currentPlayer:nx,table:null,selected:[],chamVal:null,
          log:[...nLog,'— Стол очищен —'].slice(-12),passStreak:0};
      }
      return{currentPlayer:nx,table:g.table,selected:[],chamVal:null,
        log:nLog.slice(-12),passStreak:newStreak};
    });
    setArrangeMode(false);
  }

  /* ─── CARD CLICK (only in normal mode) ─── */
  function toggleCard(card){
    if(arrangeMode) return;
    upd(g=>{
      const al=g.selected.some(c=>c.id===card.id);
      const ns=al?g.selected.filter(c=>c.id!==card.id):[...g.selected,card];
      return{selected:ns,chamVal:ns.some(c=>c.type==='chameleon')?g.chamVal:null};
    });
  }

  return(
    <div style={{minHeight:'100vh',
      background:'linear-gradient(160deg,#0c1e0d 0%,#06120a 55%,#091509 100%)',
      color:'#f0e6c8',fontFamily:"'Georgia',serif",
      padding:'10px 10px 24px',display:'flex',flexDirection:'column',
      alignItems:'center',gap:10,maxWidth:740,margin:'0 auto'}}>

      <style>{`
        @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes shake{0%,100%{transform:none}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
      `}</style>

      {/* HEADER */}
      <div style={{width:'100%',display:'flex',justifyContent:'space-between',
        alignItems:'center',padding:'6px 0 12px',
        borderBottom:'1px solid rgba(240,192,64,.18)'}}>
        <div>
          <div style={{fontSize:22,fontWeight:'bold',color:'#f0c040',letterSpacing:5,
            textShadow:'0 0 40px rgba(240,192,64,.35)'}}>🃏 САНЖУТ</div>
          <div style={{fontSize:9,color:'rgba(240,192,64,.3)',letterSpacing:3,marginTop:2}}>
            КАРТОЧНАЯ ИГРА · 4 ИГРОКА
          </div>
        </div>
        <button onClick={()=>{setGs(initGame(globalLevels));setArrangeMode(false);}} style={{
          padding:'7px 16px',background:'rgba(240,192,64,.07)',
          color:'#f0c040',border:'1px solid rgba(240,192,64,.22)',
          borderRadius:8,cursor:'pointer',fontSize:12,
          fontFamily:"'Georgia',serif",letterSpacing:1}}>
          НОВАЯ
        </button>
      </div>

      {/* PLAYERS */}
      <div style={{display:'flex',gap:6,width:'100%'}}>
        {[0,1,2,3].map(i=>(
          <PlayerBadge key={i} idx={i} level={levels[i]}
            cardCount={hands[i]?.length||0}
            active={currentPlayer===i&&phase==='playing'}
            done={finished.includes(i)} color={P_COLORS[i]}/>
        ))}
      </div>

      {/* TABLE — Feature #3: bigger */}
      <div style={{width:'100%',borderRadius:14,padding:'16px 20px',
        background:'radial-gradient(ellipse at 50% 70%,rgba(0,55,20,.7) 0%,rgba(0,18,7,.5) 100%)',
        border:'1px solid rgba(240,192,64,.14)',
        boxShadow:'inset 0 4px 28px rgba(0,0,0,.55)',
        minHeight:110,display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
        <div style={{fontSize:9,color:'rgba(240,192,64,.28)',letterSpacing:3,fontWeight:'bold'}}>СТОЛ</div>
        {table?(
          <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',
            alignItems:'center',gap:6,animation:'fadeIn .25s ease'}}>
            {/* Table cards are bigger now */}
            {table.cards.map(c=>(
              <CardFace key={c.id} card={c} sm={false} levelVal={curLV}/>
            ))}
            <div style={{marginLeft:10,padding:'5px 14px',
              background:'rgba(240,192,64,.07)',borderRadius:20,
              border:'1px solid rgba(240,192,64,.18)',
              fontSize:12,color:'#f0c040aa',alignSelf:'center'}}>
              {CLABELS[table.combo.type]} · И{table.playedBy+1}
            </div>
          </div>
        ):(
          <div style={{color:'rgba(255,255,255,.12)',fontSize:13,
            fontStyle:'italic',padding:'14px 0'}}>
            Стол пуст — ходи что хочешь
          </div>
        )}
      </div>

      {/* LOG */}
      <div style={{width:'100%',borderRadius:8,padding:'6px 12px',
        background:'rgba(0,0,0,.22)',border:'1px solid rgba(255,255,255,.04)',
        fontSize:11,maxHeight:58,overflowY:'auto',
        display:'flex',flexDirection:'column-reverse',gap:1}}>
        {[...log].reverse().map((l,i)=>(
          <div key={i} style={{
            color:i===0?'rgba(240,210,130,.75)':'rgba(100,85,50,.5)',
            animation:i===0?'fadeIn .2s ease':'none'}}>
            {l}
          </div>
        ))}
      </div>

      {/* HAND */}
      {phase==='playing'&&!finished.includes(currentPlayer)&&(
        <div style={{width:'100%',borderRadius:14,padding:'14px',
          background:'linear-gradient(175deg,rgba(0,0,0,.38),rgba(0,0,0,.22))',
          border:`1.5px solid ${P_COLORS[currentPlayer]}2a`,
          boxShadow:`0 0 40px ${P_COLORS[currentPlayer]}0d`,
          animation:'fadeIn .2s ease'}}>

          {/* Hand header */}
          <div style={{display:'flex',justifyContent:'space-between',
            alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:6}}>
            <div style={{color:P_COLORS[currentPlayer],fontSize:14,fontWeight:'bold',
              display:'flex',alignItems:'center',gap:7}}>
              <span style={{fontSize:16}}>▶</span>
              {P_NAMES[currentPlayer]}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontSize:11,color:'rgba(255,255,255,.28)'}}>
                ур. <span style={{color:'#f0c040',fontWeight:'bold',fontSize:13}}>{curLV}</span>
                <span style={{marginLeft:5,color:'rgba(255,255,255,.2)'}}>{curHand.length}к</span>
              </div>
              {/* Feature #1: arrange mode toggle */}
              <button
                onClick={()=>{setArrangeMode(m=>!m);upd(()=>({selected:[],chamVal:null}));}}
                title="Перетаскивай карты для перегруппировки"
                style={{
                  padding:'4px 10px',
                  background:arrangeMode?`${P_COLORS[currentPlayer]}33`:'rgba(255,255,255,.05)',
                  color:arrangeMode?P_COLORS[currentPlayer]:'rgba(255,255,255,.3)',
                  border:`1px solid ${arrangeMode?P_COLORS[currentPlayer]:'rgba(255,255,255,.1)'}`,
                  borderRadius:6,cursor:'pointer',fontSize:11,
                  fontFamily:"'Georgia',serif",transition:'all .2s',
                  display:'flex',alignItems:'center',gap:4}}>
                ⠿ {arrangeMode?'Готово':'Перестановка'}
              </button>
              {arrangeMode&&(
                <button onClick={resetOrder} style={{
                  padding:'4px 8px',background:'rgba(255,255,255,.04)',
                  color:'rgba(255,255,255,.25)',
                  border:'1px solid rgba(255,255,255,.08)',
                  borderRadius:6,cursor:'pointer',fontSize:10,
                  fontFamily:"'Georgia',serif"}}>
                  ↺ Сброс
                </button>
              )}
            </div>
          </div>

          {/* Mode hint */}
          {arrangeMode&&(
            <div style={{fontSize:11,color:'rgba(96,165,250,.6)',marginBottom:8,
              padding:'5px 10px',background:'rgba(96,165,250,.06)',
              borderRadius:6,border:'1px solid rgba(96,165,250,.12)'}}>
              ✦ Перетаскивай карты для изменения порядка. Нажми «Готово» чтобы вернуться к игре.
            </div>
          )}

          {/* CARDS */}
          <div style={{display:'flex',flexWrap:'wrap',gap:4,
            minHeight:100,padding:'4px 0 20px',alignItems:'flex-end'}}>
            {curHand.map((card,idx)=>(
              <CardFace
                key={card.id}
                card={card}
                sel={!arrangeMode&&isSel(card)}
                onClick={arrangeMode?undefined:()=>toggleCard(card)}
                levelVal={curLV}
                isDragOver={arrangeMode&&dragOverIdx===idx}
                dragHandlers={arrangeMode?{
                  draggable:true,
                  onDragStart:()=>onDragStart(idx),
                  onDragOver:(e)=>onDragOver(e,idx),
                  onDrop:(e)=>onDrop(e,idx),
                  onDragEnd,
                  'data-dragging': dragIdx.current===idx ? 'true' : undefined,
                }:undefined}
              />
            ))}
          </div>

          {/* CHAMELEON PICKER */}
          {!arrangeMode&&hasChamSel&&(
            <div style={{marginBottom:12,display:'flex',alignItems:'center',
              flexWrap:'wrap',gap:4,padding:'8px 12px',
              background:'rgba(107,33,168,.1)',borderRadius:10,
              border:'1px solid rgba(155,89,182,.2)'}}>
              <span style={{fontSize:11,color:'#c39bd3',marginRight:4,flexShrink:0}}>✦ Хамелеон =</span>
              {CHAM_OK.map(v=>(
                <button key={v} onClick={()=>upd(()=>({chamVal:v}))} style={{
                  padding:'3px 9px',
                  background:chamVal===v?'rgba(155,89,182,.55)':'rgba(155,89,182,.1)',
                  color:chamVal===v?'#fff':'#c39bd3',
                  border:`1px solid ${chamVal===v?'#9b59b6':'rgba(155,89,182,.22)'}`,
                  borderRadius:5,cursor:'pointer',fontSize:11,
                  fontFamily:"'Georgia',serif",transition:'all .15s'}}>
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* COMBO STATUS */}
          {!arrangeMode&&selected.length>0&&(
            <div style={{fontSize:12,marginBottom:12,display:'flex',
              alignItems:'center',gap:7}}>
              <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,
                background:canPlayIt?'#52c97a':'#e05c5c',
                boxShadow:`0 0 10px ${canPlayIt?'#52c97a':'#e05c5c'}`}}/>
              <span style={{color:canPlayIt?'#86efac':'#fca5a5'}}>
                {curCombo
                  ?`${CLABELS[curCombo.type]}${canPlayIt?' — можно сыграть':' — не бьёт стол'}`
                  :'Недопустимая комбинация'}
              </span>
            </div>
          )}

          {/* ACTION BUTTONS */}
          {!arrangeMode&&(
            <div style={{display:'flex',gap:8,flexWrap:'wrap',
              animation:badAnim?'shake .35s ease':'none'}}>
              <button onClick={canPlayIt?playCards:bad} style={{
                padding:'11px 28px',
                background:canPlayIt
                  ?'linear-gradient(135deg,#c8920e,#f0c040)'
                  :'rgba(255,255,255,.04)',
                color:canPlayIt?'#111':'rgba(255,255,255,.15)',
                border:`1px solid ${canPlayIt?'#f0c040':'rgba(255,255,255,.07)'}`,
                borderRadius:10,cursor:canPlayIt?'pointer':'default',
                fontWeight:'bold',fontSize:14,fontFamily:"'Georgia',serif",letterSpacing:.5,
                boxShadow:canPlayIt?'0 4px 22px rgba(240,192,64,.4)':'none',
                transition:'all .2s'}}>
                СЫГРАТЬ
              </button>
              {canPassIt&&(
                <button onClick={pass} style={{
                  padding:'11px 22px',background:'rgba(255,255,255,.04)',
                  color:'rgba(255,255,255,.35)',border:'1px solid rgba(255,255,255,.09)',
                  borderRadius:10,cursor:'pointer',fontSize:14,
                  fontFamily:"'Georgia',serif",transition:'all .2s'}}>
                  ПАС
                </button>
              )}
              {selected.length>0&&(
                <button onClick={()=>upd(()=>({selected:[],chamVal:null}))} style={{
                  padding:'11px 14px',background:'transparent',
                  color:'rgba(255,255,255,.18)',border:'1px solid rgba(255,255,255,.06)',
                  borderRadius:10,cursor:'pointer',fontSize:13,transition:'all .2s'}}>
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* FINISHED */}
      {phase==='finished'&&(
        <div style={{width:'100%',borderRadius:14,padding:'24px 20px',
          background:'radial-gradient(ellipse at 50% 30%,rgba(240,192,64,.08) 0%,transparent 70%)',
          border:'1.5px solid rgba(240,192,64,.28)',textAlign:'center',
          animation:'fadeIn .4s ease'}}>
          <div style={{fontSize:40,marginBottom:6}}>🏆</div>
          <div style={{fontSize:18,color:'#f0c040',fontWeight:'bold',
            letterSpacing:3,marginBottom:6}}>ПАРТИЯ ОКОНЧЕНА</div>
          <div style={{fontSize:11,color:'rgba(240,192,64,.4)',marginBottom:16}}>
            Уровни сохранены для следующей игры
          </div>
          {[0,1,2,3].sort((a,b)=>levels[b]-levels[a]).map((i,rank)=>(
            <div key={i} style={{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'9px 18px',margin:'5px 0',borderRadius:9,
              background:rank===0?'rgba(240,192,64,.09)':'rgba(255,255,255,.02)',
              border:`1px solid ${rank===0?'rgba(240,192,64,.28)':'rgba(255,255,255,.05)'}`}}>
              <span style={{color:P_COLORS[i],fontWeight:'bold',fontSize:14}}>{P_NAMES[i]}</span>
              <span style={{color:'#f0c040',fontSize:20,fontWeight:'bold'}}>{getLV(levels[i])}</span>
            </div>
          ))}
          <button onClick={()=>{setGs(initGame(levels));setArrangeMode(false);}} style={{
            marginTop:20,padding:'12px 34px',
            background:'linear-gradient(135deg,#c8920e,#f0c040)',
            color:'#111',border:'none',borderRadius:10,cursor:'pointer',
            fontWeight:'bold',fontSize:15,fontFamily:"'Georgia',serif",letterSpacing:1,
            boxShadow:'0 4px 22px rgba(240,192,64,.45)'}}>
            НОВАЯ ИГРА →
          </button>
        </div>
      )}

      <div style={{fontSize:10,color:'rgba(255,255,255,.1)',textAlign:'center',paddingTop:4}}>
        🟢 Зелёная точка = карта твоего уровня
      </div>
    </div>
  );
}
