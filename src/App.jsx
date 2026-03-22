import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "https://sanzhut-server-production.up.railway.app";

const RED_SUITS  = new Set(['♥','♦']);
const P_COLORS   = ['#f87171','#60a5fa','#4ade80','#fb923c'];
const P_AVATARS  = ['♠','♦','♣','♥'];
const CLABELS    = {single:'Одна карта',pair:'Пара',small_bomb:'Малая бомба',
  big_bomb:'Большая бомба',hatar:'Хатар',sanzhut:'Санжут'};
const REG_VALS   = ['4','5','6','7','8','9','10','J','Q','K','A','2','3'];
const CHAM_OK    = REG_VALS.filter(v=>!['2','3'].includes(v));
const VR = {};
REG_VALS.forEach((v,i)=>VR[v]=i);
VR['JB']=13; VR['JR']=14;

const rvOf = (c,cv) => c.type==='chameleon'?(cv||'4'):c.value;
const SEQ_BAD = new Set(['2','3','JB','JR']);

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
  if(n===2){if(allSame()) return{type:'pair',rank:ranks[0]};if(hasCh&&ncR.length===1) return{type:'pair',rank:ncR[0]};}
  if(n===3){if(allSame()) return{type:'small_bomb',rank:ranks[0]};if(hasCh&&new Set(ncR).size===1&&ncR.length===2) return{type:'small_bomb',rank:ncR[0]};}
  if(n===4){if(allSame()) return{type:'big_bomb',rank:ranks[0]};if(hasCh&&new Set(ncR).size===1&&ncR.length===3) return{type:'big_bomb',rank:ncR[0]};}
  if(n>=4){const h=chkHatar(res,hasCh,n);if(h) return h;}
  if(n>=6&&n%2===0){const s=chkSanzhut(res,n);if(s) return s;}
  return null;
}
function chkHatar(res,hasCh,n){
  const nonCh=res.filter(c=>c.type!=='chameleon');
  if(nonCh.some(c=>SEQ_BAD.has(c.rv))) return null;
  const ncR=[...new Set(nonCh.map(c=>VR[c.rv]??-1))].sort((a,b)=>a-b);
  if(ncR.length!==nonCh.length) return null;
  if(!hasCh){if(ncR[ncR.length-1]-ncR[0]===n-1) return{type:'hatar',length:n,rank:ncR[0]};}
  else{const span=ncR[ncR.length-1]-ncR[0]+1,gaps=span-nonCh.length;if(gaps===1&&span===n) return{type:'hatar',length:n,rank:ncR[0]};if(gaps===0&&nonCh.length===n-1) return{type:'hatar',length:n,rank:ncR[0]>0?ncR[0]-1:ncR[0]};}
  return null;
}
function chkSanzhut(res,n){
  const nonCh=res.filter(c=>c.type!=='chameleon');
  if(nonCh.some(c=>SEQ_BAD.has(c.rv))) return null;
  const vc={};nonCh.forEach(c=>{vc[c.rv]=(vc[c.rv]||0)+1;});
  const vals=Object.keys(vc);if(vals.some(v=>vc[v]!==2)) return null;
  const rk=vals.map(v=>VR[v]).sort((a,b)=>a-b);const pairs=n/2;
  if(rk[rk.length-1]-rk[0]===pairs-1&&rk.length===pairs) return{type:'sanzhut',pairs,rank:rk[0]};
  return null;
}
function canBeat(played,table){
  if(!table) return true;
  const{type:pt,rank:pr,length:pl,pairs:pp}=played;
  const{type:tt,rank:tr,length:tl,pairs:tp}=table;
  if(pt==='big_bomb') return tt==='big_bomb'?pr>tr:true;
  if(tt==='single'&&tr===VR['JR']) return false;
  if(pt==='small_bomb'){if(tt==='single') return true;if(tt==='pair') return true;if(tt==='hatar') return true;if(tt==='small_bomb') return pr>tr;return false;}
  if(pt===tt){if(['single','pair','small_bomb','big_bomb'].includes(pt)) return pr>tr;if(pt==='hatar') return pl===tl&&pr>tr;if(pt==='sanzhut') return pp===tp&&pr>tr;}
  return false;
}

const SUIT_O={'♠':0,'♥':1,'♦':2,'♣':3};
function sortCards(h){
  return [...h].sort((a,b)=>{
    const ra=a.type==='chameleon'?16:a.type==='joker_red'?15:a.type==='joker_black'?14:(VR[a.value]??0);
    const rb=b.type==='chameleon'?16:b.type==='joker_red'?15:b.type==='joker_black'?14:(VR[b.value]??0);
    return ra!==rb?ra-rb:(SUIT_O[a.suit]??0)-(SUIT_O[b.suit]??0);
  });
}

/* ── Card Face ── */
function CardFace({card,sel,onClick,sm,levelVal,dragHandlers,isDragOver,faceDown}){
  const W = sm ? 28 : 46;
  const H = sm ? 40 : 66;

  if(faceDown){
    return(
      <div style={{
        width:W,height:H,
        background:'linear-gradient(145deg,#1e3a5f,#0f2040)',
        border:'1.5px solid rgba(99,179,237,0.15)',
        borderRadius:sm?5:8,flexShrink:0,
        boxShadow:'0 3px 8px rgba(0,0,0,.6)',
        display:'flex',alignItems:'center',justifyContent:'center',
        position:'relative',overflow:'hidden',
      }}>
        <div style={{
          width:'80%',height:'80%',
          backgroundImage:`repeating-linear-gradient(45deg,rgba(255,255,255,.03) 0px,rgba(255,255,255,.03) 1px,transparent 1px,transparent 8px),
            repeating-linear-gradient(-45deg,rgba(255,255,255,.03) 0px,rgba(255,255,255,.03) 1px,transparent 1px,transparent 8px)`,
          border:'1px solid rgba(255,255,255,.06)',
          borderRadius:sm?3:5,
        }}/>
      </div>
    );
  }

  let cardClass='';
  let topLabel,botLabel,centerSuit,topColor,bgGrad,borderColor;

  if(card.type==='joker_black'){
    topLabel='JK'; botLabel='♟'; centerSuit='🃏';
    topColor='#374151'; bgGrad='linear-gradient(145deg,#f9fafb,#e5e7eb)';
    borderColor='#9ca3af';
  } else if(card.type==='joker_red'){
    topLabel='JK'; botLabel='♦'; centerSuit='🃏';
    topColor='#991b1b'; bgGrad='linear-gradient(145deg,#fff5f5,#fecaca)';
    borderColor='#f87171';
  } else if(card.type==='chameleon'){
    topLabel='✦'; botLabel='★'; centerSuit='✦';
    topColor='#6b21a8'; bgGrad='linear-gradient(145deg,#faf5ff,#e9d5ff)';
    borderColor='#a855f7';
  } else {
    topLabel=card.value; botLabel=card.suit; centerSuit=card.suit;
    const red=RED_SUITS.has(card.suit);
    topColor=red?'#c0392b':'#1a1a2e';
    bgGrad='linear-gradient(145deg,#fffef8,#faf4e0)';
    borderColor=red?'#f87171':'#d4d0b8';
  }

  const isLv=card.value===levelVal&&card.type==='regular'&&!sm;
  const fs = sm ? { val:9, suit:8, center:12 } : { val:13, suit:10, center:20 };

  return(
    <div onClick={onClick} {...(dragHandlers||{})} style={{
      width:W,height:H,
      background:bgGrad,
      border:`2px solid ${isDragOver?'#60a5fa':sel?'#f59e0b':isLv?'#4ade80':borderColor}`,
      borderRadius:sm?5:8,
      display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'space-between',
      cursor:dragHandlers?'grab':onClick?'pointer':'default',
      transform:sel?`translateY(-14px) scale(1.07)`:isDragOver?'scale(1.07)':'none',
      transition:'transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s,border-color .15s',
      boxShadow:sel
        ?`0 10px 28px rgba(245,158,11,.45), 0 0 0 1px rgba(245,158,11,.3)`
        :isDragOver?'0 0 0 3px #60a5fa'
        :isLv?'0 2px 10px rgba(74,222,128,.3)'
        :'0 3px 8px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.8)',
      color:topColor,fontWeight:'bold',userSelect:'none',flexShrink:0,
      position:'relative',padding:sm?'2px 3px':'3px 4px',
    }}>
      {isLv&&<div style={{
        position:'absolute',top:2,right:2,width:5,height:5,
        borderRadius:'50%',background:'#4ade80',
        boxShadow:'0 0 6px #4ade80',
      }}/>}
      {/* Top corner */}
      <div style={{alignSelf:'flex-start',lineHeight:1.1}}>
        <div style={{fontSize:fs.val,fontWeight:'900',letterSpacing:'-0.03em'}}>{topLabel}</div>
        <div style={{fontSize:fs.suit,lineHeight:1}}>{botLabel}</div>
      </div>
      {/* Center suit */}
      {!sm&&<div style={{fontSize:fs.center,opacity:.7,lineHeight:1}}>{centerSuit}</div>}
      {/* Bottom corner (rotated) */}
      <div style={{alignSelf:'flex-end',lineHeight:1.1,transform:'rotate(180deg)'}}>
        <div style={{fontSize:fs.val,fontWeight:'900',letterSpacing:'-0.03em'}}>{topLabel}</div>
        <div style={{fontSize:fs.suit,lineHeight:1}}>{botLabel}</div>
      </div>
    </div>
  );
}

/* ── Player Seat ── */
function Seat({player,isActive,cardCount,finished,position}){
  if(!player) return <div style={{width:56}}/>;

  const color = P_COLORS[player.seatIndex??0];
  const avatar = P_AVATARS[player.seatIndex??0];
  const isTop = position==='top';
  const isLeft = position==='left';
  const isRight = position==='right';

  const visibleCards = Math.min(cardCount, 6);
  const extra = cardCount > 6 ? cardCount - 6 : 0;

  const cardStack = (
    <div style={{
      display:'flex',
      flexDirection: isTop ? 'row' : 'column',
      gap: isTop ? -6 : -8,
      alignItems:'center',
    }}>
      {Array.from({length:visibleCards}).map((_,i)=>(
        <div key={i} style={{
          width: isTop ? 14 : 10,
          height: isTop ? 20 : 14,
          background:'linear-gradient(145deg,#1e3a5f,#0f2040)',
          border:'1px solid rgba(99,179,237,0.18)',
          borderRadius:2,
          boxShadow:'0 1px 3px rgba(0,0,0,.5)',
          marginLeft: isTop ? (i>0?-8:0) : 0,
          marginTop: isTop ? 0 : (i>0?-8:0),
        }}/>
      ))}
      {extra>0&&<span style={{fontSize:8,color:'rgba(255,255,255,.35)',marginLeft:2}}>+{extra}</span>}
    </div>
  );

  const badge = (
    <div style={{
      display:'flex',flexDirection:'column',alignItems:'center',gap:3,
    }}>
      {/* Avatar */}
      <div style={{
        width:36,height:36,borderRadius:'50%',
        background:isActive?`${color}22`:'rgba(255,255,255,.05)',
        border:`2px solid ${isActive?color:finished?`${color}44`:'rgba(255,255,255,.08)'}`,
        boxShadow:isActive?`0 0 16px ${color}66,0 0 32px ${color}22`:'none',
        display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:14,transition:'all .3s',flexShrink:0,
        position:'relative',
      }}>
        <span style={{color:isActive?color:'rgba(255,255,255,.3)'}}>{avatar}</span>
        {isActive&&<div style={{
          position:'absolute',bottom:-1,right:-1,
          width:9,height:9,borderRadius:'50%',
          background:color,border:'1.5px solid #0a0a0f',
          boxShadow:`0 0 6px ${color}`,
          animation:'pulse 1.2s infinite',
        }}/>}
        {finished&&<div style={{
          position:'absolute',inset:0,borderRadius:'50%',
          background:'rgba(0,0,0,.55)',
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:12,
        }}>✓</div>}
      </div>
      {/* Name + level */}
      <div style={{textAlign:'center'}}>
        <div style={{
          fontSize:9,fontWeight:700,
          color:isActive?color:'rgba(255,255,255,.35)',
          maxWidth:52,overflow:'hidden',textOverflow:'ellipsis',
          whiteSpace:'nowrap',letterSpacing:.5,
        }}>{player.name}</div>
        <div style={{
          fontSize:12,fontWeight:900,
          color:'#f59e0b',
          textShadow:isActive?'0 0 10px rgba(245,158,11,.6)':'none',
          fontFamily:"'Georgia',serif",
        }}>{player.level}</div>
      </div>
    </div>
  );

  if(isTop){
    return(
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,opacity:finished?.5:1}}>
        {badge}
        {cardStack}
      </div>
    );
  }

  return(
    <div style={{
      display:'flex',
      flexDirection: isLeft ? 'row' : 'row-reverse',
      alignItems:'center',gap:5,opacity:finished?.5:1,
    }}>
      {badge}
      {cardStack}
    </div>
  );
}

/* ── Lobby ── */
function Lobby({onCreate,onJoin,error}){
  const[name,setName]=useState('');
  const[code,setCode]=useState('');
  const[mode,setMode]=useState(null);
  const tgName=window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name;
  useEffect(()=>{if(tgName&&!name) setName(tgName);},[]);

  const S = {
    wrap:{
      minHeight:'100vh',
      background:'radial-gradient(ellipse at 40% 0%,#0d1f3c 0%,#050810 60%)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:24,color:'#f0e6c8',fontFamily:"'Inter',sans-serif",
    },
    inp:{
      padding:'13px 16px',width:'100%',
      background:'rgba(255,255,255,.05)',
      color:'#f8fafc',border:'1px solid rgba(255,255,255,.1)',
      borderRadius:12,fontSize:16,outline:'none',
      fontFamily:"'Inter',sans-serif",
      transition:'border-color .2s,box-shadow .2s',
    },
    btnPrimary:{
      padding:'14px',width:'100%',
      background:'linear-gradient(135deg,#d97706,#f59e0b)',
      color:'#111',border:'none',borderRadius:12,
      cursor:'pointer',fontWeight:800,fontSize:15,
      fontFamily:"'Outfit',sans-serif",letterSpacing:.5,
      boxShadow:'0 4px 20px rgba(245,158,11,.35)',
      transition:'all .2s',
    },
    btnGhost:{
      padding:'13px',width:'100%',
      background:'rgba(255,255,255,.04)',
      color:'rgba(255,255,255,.5)',
      border:'1px solid rgba(255,255,255,.1)',
      borderRadius:12,cursor:'pointer',fontWeight:600,
      fontSize:15,fontFamily:"'Outfit',sans-serif",
      transition:'all .2s',
    },
    back:{
      padding:'10px',background:'transparent',
      color:'rgba(255,255,255,.25)',border:'none',
      cursor:'pointer',fontSize:13,fontFamily:"'Inter',sans-serif",
    },
  };

  return(
    <div style={S.wrap}>
      {/* Logo */}
      <div style={{textAlign:'center',marginBottom:48}}>
        <div style={{
          fontSize:11,letterSpacing:6,color:'rgba(245,158,11,.4)',
          fontFamily:"'Outfit',sans-serif",fontWeight:600,marginBottom:10,
        }}>КАРТОЧНАЯ ИГРА</div>
        <div style={{
          fontSize:42,fontWeight:900,letterSpacing:8,
          fontFamily:"'Outfit',sans-serif",
          background:'linear-gradient(135deg,#fcd34d,#f59e0b,#d97706)',
          WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',
          filter:'drop-shadow(0 0 40px rgba(245,158,11,.4))',
        }}>🃏 САНЖУТ</div>
        <div style={{
          marginTop:10,fontSize:10,color:'rgba(255,255,255,.15)',
          letterSpacing:4,fontFamily:"'Outfit',sans-serif",
        }}>ОНЛАЙН · 4 ИГРОКА</div>
      </div>

      {error&&(
        <div style={{
          marginBottom:14,padding:'10px 16px',
          background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',
          borderRadius:10,fontSize:12,color:'#fca5a5',
          maxWidth:300,width:'100%',textAlign:'center',
        }}>{error}</div>
      )}

      <div style={{width:'100%',maxWidth:300,display:'flex',flexDirection:'column',gap:10}}>
        {!mode?(
          <>
            <button onClick={()=>setMode('create')} style={S.btnPrimary}>СОЗДАТЬ КОМНАТУ</button>
            <button onClick={()=>setMode('join')} style={S.btnGhost}>ВОЙТИ В КОМНАТУ</button>
          </>
        ):mode==='create'?(
          <>
            <input value={name} onChange={e=>setName(e.target.value)}
              placeholder="Твоё имя" maxLength={16} style={S.inp}/>
            <button onClick={()=>name.trim()&&onCreate(name.trim())}
              style={{...S.btnPrimary,opacity:name.trim()?1:.4}}>СОЗДАТЬ</button>
            <button onClick={()=>setMode(null)} style={S.back}>← Назад</button>
          </>
        ):(
          <>
            <input value={name} onChange={e=>setName(e.target.value)}
              placeholder="Твоё имя" maxLength={16} style={S.inp}/>
            <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
              placeholder="КОД КОМНАТЫ" maxLength={6}
              style={{...S.inp,fontSize:22,letterSpacing:8,textAlign:'center',color:'#f59e0b'}}/>
            <button
              onClick={()=>name.trim()&&code.trim()&&onJoin(name.trim(),code.trim())}
              style={{...S.btnPrimary,opacity:(name.trim()&&code.trim())?1:.4}}>
              ВОЙТИ
            </button>
            <button onClick={()=>setMode(null)} style={S.back}>← Назад</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Waiting ── */
function WaitingRoom({roomCode,players}){
  return(
    <div style={{
      minHeight:'100vh',
      background:'radial-gradient(ellipse at 40% 0%,#0d1f3c,#050810)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:24,color:'#f8fafc',fontFamily:"'Inter',sans-serif",
    }}>
      <div style={{
        fontSize:28,fontWeight:900,letterSpacing:6,fontFamily:"'Outfit',sans-serif",
        background:'linear-gradient(135deg,#fcd34d,#f59e0b)',
        WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',
        marginBottom:8,
      }}>🃏 САНЖУТ</div>
      <div style={{fontSize:11,color:'rgba(255,255,255,.25)',letterSpacing:3,marginBottom:36,fontFamily:"'Outfit',sans-serif"}}>
        ОЖИДАНИЕ ИГРОКОВ
      </div>

      {/* Room code */}
      <div style={{
        background:'rgba(245,158,11,.06)',
        border:'1px solid rgba(245,158,11,.2)',
        borderRadius:16,padding:'20px 40px',marginBottom:32,textAlign:'center',
      }}>
        <div style={{fontSize:9,color:'rgba(245,158,11,.4)',letterSpacing:4,marginBottom:10,fontFamily:"'Outfit',sans-serif"}}>КОД КОМНАТЫ</div>
        <div style={{
          fontSize:44,fontWeight:900,color:'#f59e0b',letterSpacing:12,
          textShadow:'0 0 40px rgba(245,158,11,.4)',fontFamily:"'Outfit',sans-serif",
        }}>{roomCode}</div>
        <div style={{fontSize:10,color:'rgba(255,255,255,.2)',marginTop:10}}>Отправь друзьям</div>
      </div>

      {/* Player slots */}
      <div style={{width:'100%',maxWidth:300,display:'flex',flexDirection:'column',gap:8}}>
        {[0,1,2,3].map(i=>{
          const p=players[i];
          const c=P_COLORS[i];
          return(
            <div key={i} style={{
              display:'flex',alignItems:'center',gap:12,
              padding:'11px 16px',borderRadius:12,
              background:p?`rgba(${hexToRgb(c)},.05)`:'rgba(255,255,255,.02)',
              border:`1px solid ${p?c+'30':'rgba(255,255,255,.05)'}`,
              transition:'all .3s',
            }}>
              <div style={{
                width:8,height:8,borderRadius:'50%',flexShrink:0,
                background:p?c:'rgba(255,255,255,.08)',
                boxShadow:p?`0 0 8px ${c}`:'none',
              }}/>
              <span style={{color:p?'#f8fafc':'rgba(255,255,255,.18)',fontSize:14,fontWeight:p?600:400}}>
                {p?.name||`Игрок ${i+1}...`}
              </span>
              {p&&<span style={{marginLeft:'auto',fontSize:12,color:'#f59e0b',fontFamily:"'Georgia',serif",fontWeight:700}}>{p.level}</span>}
            </div>
          );
        })}
      </div>
      <div style={{marginTop:24,fontSize:10,color:'rgba(255,255,255,.15)',letterSpacing:2}}>ИГРА НАЧНЁТСЯ АВТОМАТИЧЕСКИ</div>
    </div>
  );
}

function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

/* ── GAME ── */
export function Game({gs,socket,roomCode}){
  const[selected,setSelected]=useState([]);
  const[chamVal,setChamVal]=useState(null);
  const[arrangeMode,setArrangeMode]=useState(false);
  const[badAnim,setBadAnim]=useState(false);
  const[cardOrder,setCardOrder]=useState(null);
  const dragIdx=useRef(null);
  const[dragOverIdx,setDragOverIdx]=useState(null);

  const{players,table,log,finished,phase,myCards,mySeatIndex,currentPlayer}=gs;
  const isMyTurn=mySeatIndex===currentPlayer&&phase==='playing';
  const me=players[mySeatIndex];
  const myLV=me?.level||'4';
  const myColor=P_COLORS[mySeatIndex]||'#60a5fa';

  useEffect(()=>{setCardOrder(sortCards(myCards).map(c=>c.id));},[myCards.length]);
  useEffect(()=>{if(!isMyTurn){setSelected([]);setChamVal(null);}},[isMyTurn]);

  const existingIds=new Set(myCards.map(c=>c.id));
  const cardById=Object.fromEntries(myCards.map(c=>[c.id,c]));
  const orderedIds=(cardOrder||[]).filter(id=>existingIds.has(id));
  const displayCards=orderedIds.length===myCards.length?orderedIds.map(id=>cardById[id]):sortCards(myCards);

  const isSel=c=>selected.some(s=>s.id===c.id);
  const hasChamSel=selected.some(c=>c.type==='chameleon');
  const curCombo=selected.length>0?detectCombo(selected,chamVal):null;
  const canPlayIt=!!(curCombo&&(!table||canBeat(curCombo,table.combo)));
  const canPassIt=!!(table&&table.playedBy!==mySeatIndex&&isMyTurn);

  function bad(){setBadAnim(true);setTimeout(()=>setBadAnim(false),400);}
  function toggleCard(card){
    if(arrangeMode||!isMyTurn) return;
    const al=selected.some(c=>c.id===card.id);
    const ns=al?selected.filter(c=>c.id!==card.id):[...selected,card];
    setSelected(ns);if(!ns.some(c=>c.type==='chameleon')) setChamVal(null);
  }
  function playCards(){
    if(!canPlayIt){bad();return;}
    socket.emit('playCards',{code:roomCode,cardIds:selected.map(c=>c.id),chamVal});
    setSelected([]);setChamVal(null);setArrangeMode(false);
  }
  function pass(){socket.emit('pass',{code:roomCode});setSelected([]);setChamVal(null);}
  function onDragStart(idx){dragIdx.current=idx;}
  function onDragOver(e,idx){e.preventDefault();setDragOverIdx(idx);}
  function onDrop(e,toIdx){
    e.preventDefault();const fromIdx=dragIdx.current;
    if(fromIdx===null||fromIdx===toIdx){setDragOverIdx(null);return;}
    const order=[...displayCards.map(c=>c.id)];
    const item=order.splice(fromIdx,1)[0];order.splice(toIdx,0,item);
    setCardOrder(order);dragIdx.current=null;setDragOverIdx(null);
  }
  function onDragEnd(){dragIdx.current=null;setDragOverIdx(null);}

  const getSeat=(rel)=>{
    const abs=(mySeatIndex+rel)%4;
    const p=players[abs];
    return{player:p,isActive:currentPlayer===abs&&phase==='playing',
      cardCount:p?.cardCount||0,finished:finished.includes(abs)};
  };
  const right=getSeat(1), top=getSeat(2), left=getSeat(3);

  return(
    <div style={{
      height:'100dvh',overflow:'hidden',
      background:'linear-gradient(160deg,#080d1a 0%,#050810 50%,#060c14 100%)',
      color:'#f8fafc',fontFamily:"'Inter',sans-serif",
      display:'flex',flexDirection:'column',
      maxWidth:480,margin:'0 auto',position:'relative',
    }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}
        @keyframes shake{0%,100%{transform:none}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes popIn{from{opacity:0;transform:scale(.88) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* TOP PLAYER */}
      <div style={{
        display:'flex',justifyContent:'center',
        padding:'10px 12px 0',zIndex:2,
      }}>
        <Seat {...top} position="top"/>
      </div>

      {/* MIDDLE ROW */}
      <div style={{flex:1,display:'flex',alignItems:'center',padding:'4px 8px',gap:4,minHeight:0}}>

        {/* LEFT */}
        <div style={{display:'flex',alignItems:'center',flexShrink:0}}>
          <Seat {...left} position="left"/>
        </div>

        {/* TABLE */}
        <div style={{flex:1,position:'relative',alignSelf:'stretch',display:'flex',alignItems:'center',justifyContent:'center'}}>

          {/* Felt surface */}
          <div style={{
            position:'absolute',inset:0,
            background:'radial-gradient(ellipse at 50% 45%,#1a5c30 0%,#134522 40%,#0b2e17 70%,#071b0e 100%)',
            borderRadius:'44%',
            border:'3px solid #061208',
            boxShadow:`
              inset 0 8px 40px rgba(0,0,0,.6),
              inset 0 0 0 1px rgba(255,255,255,.03),
              0 10px 50px rgba(0,0,0,.7),
              0 0 0 1px rgba(255,255,255,.03)
            `,
          }}>
            {/* Inner ring */}
            <div style={{
              position:'absolute',inset:10,borderRadius:'44%',
              border:'1px solid rgba(255,255,255,.04)',
              pointerEvents:'none',
            }}/>
            {/* Subtle pattern */}
            <div style={{
              position:'absolute',inset:0,borderRadius:'44%',
              backgroundImage:'radial-gradient(circle,rgba(255,255,255,.012) 1px,transparent 1px)',
              backgroundSize:'18px 18px',
            }}/>
          </div>

          {/* Table content */}
          <div style={{
            position:'relative',zIndex:2,
            display:'flex',flexDirection:'column',
            alignItems:'center',justifyContent:'center',
            gap:8,padding:16,width:'100%',
          }}>
            {table?(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:7,animation:'popIn .22s ease'}}>
                <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:3,maxWidth:200}}>
                  {table.cards.map(c=>(
                    <CardFace key={c.id} card={c} levelVal={myLV} sm/>
                  ))}
                </div>
                <div style={{
                  padding:'4px 12px',
                  background:'rgba(0,0,0,.55)',
                  backdropFilter:'blur(6px)',
                  borderRadius:20,
                  border:'1px solid rgba(245,158,11,.15)',
                  fontSize:10,color:'rgba(245,158,11,.9)',
                  fontWeight:600,letterSpacing:.3,
                }}>
                  {CLABELS[table.combo?.type]} · {players[table.playedBy]?.name}
                </div>
              </div>
            ):(
              <div style={{
                color:'rgba(255,255,255,.2)',fontSize:11,
                textAlign:'center',letterSpacing:.5,
              }}>
                {isMyTurn?<>Твой ход<br/>Ходи первым</> : ''}
              </div>
            )}
          </div>

          {/* Room code */}
          <div style={{
            position:'absolute',bottom:8,fontSize:8,
            color:'rgba(255,255,255,.08)',letterSpacing:3,
            fontFamily:'monospace',
          }}>{roomCode}</div>
        </div>

        {/* RIGHT */}
        <div style={{display:'flex',alignItems:'center',flexShrink:0}}>
          <Seat {...right} position="right"/>
        </div>
      </div>

      {/* MY AREA */}
      <div style={{
        padding:'8px 12px 14px',
        background:'linear-gradient(0deg,rgba(5,8,16,.95) 0%,rgba(5,8,16,.6) 100%)',
        borderTop:'1px solid rgba(255,255,255,.06)',
      }}>

        {/* My info row */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            {isMyTurn&&(
              <div style={{
                width:6,height:6,borderRadius:'50%',
                background:myColor,
                boxShadow:`0 0 10px ${myColor}`,
                animation:'pulse 1.2s infinite',
              }}/>
            )}
            <span style={{
              fontSize:12,fontWeight:700,
              color:isMyTurn?myColor:'rgba(255,255,255,.35)',
              letterSpacing:.3,
            }}>
              {me?.name||'Я'}
            </span>
            <span style={{
              fontSize:16,color:'#f59e0b',fontWeight:900,
              fontFamily:"'Georgia',serif",
              textShadow:isMyTurn?'0 0 12px rgba(245,158,11,.5)':'none',
            }}>{myLV}</span>
            <span style={{
              fontSize:10,color:'rgba(255,255,255,.18)',
              background:'rgba(255,255,255,.05)',
              padding:'1px 6px',borderRadius:6,
            }}>{myCards.length} карт</span>
          </div>
          <button onClick={()=>{setArrangeMode(m=>!m);setSelected([]);setChamVal(null);}} style={{
            padding:'4px 10px',fontSize:10,fontWeight:600,
            background:arrangeMode?`${myColor}20`:'rgba(255,255,255,.04)',
            color:arrangeMode?myColor:'rgba(255,255,255,.3)',
            border:`1px solid ${arrangeMode?myColor:'rgba(255,255,255,.08)'}`,
            borderRadius:6,cursor:'pointer',
            fontFamily:"'Inter',sans-serif",letterSpacing:.3,
            transition:'all .2s',
          }}>
            {arrangeMode?'✓ Готово':'⠿ Порядок'}
          </button>
        </div>

        {/* Chameleon value picker */}
        {!arrangeMode&&hasChamSel&&(
          <div style={{
            marginBottom:6,display:'flex',alignItems:'center',
            flexWrap:'wrap',gap:3,padding:'6px 10px',
            background:'rgba(168,85,247,.08)',
            borderRadius:8,border:'1px solid rgba(168,85,247,.18)',
          }}>
            <span style={{fontSize:10,color:'#c084fc',marginRight:2}}>✦ =</span>
            {CHAM_OK.map(v=>(
              <button key={v} onClick={()=>setChamVal(v)} style={{
                padding:'2px 7px',
                background:chamVal===v?'rgba(168,85,247,.45)':'rgba(168,85,247,.08)',
                color:chamVal===v?'#fff':'#c084fc',
                border:`1px solid ${chamVal===v?'#a855f7':'rgba(168,85,247,.18)'}`,
                borderRadius:4,cursor:'pointer',fontSize:10,
                fontFamily:"'Georgia',serif",fontWeight:700,
                transition:'all .15s',
              }}>{v}</button>
            ))}
          </div>
        )}

        {/* Combo status */}
        {!arrangeMode&&selected.length>0&&(
          <div style={{
            fontSize:10,marginBottom:5,
            display:'flex',alignItems:'center',gap:6,
            animation:'slideUp .15s ease',
          }}>
            <div style={{
              width:5,height:5,borderRadius:'50%',flexShrink:0,
              background:canPlayIt?'#4ade80':'#f87171',
              boxShadow:`0 0 6px ${canPlayIt?'#4ade80':'#f87171'}`,
            }}/>
            <span style={{color:canPlayIt?'#86efac':'#fca5a5',fontWeight:600}}>
              {curCombo
                ?`${CLABELS[curCombo.type]}${canPlayIt?' ✓':' — не бьёт'}`
                :'Недопустимая комбинация'}
            </span>
          </div>
        )}

        {/* Hand */}
        <div style={{
          display:'flex',flexWrap:'wrap',gap:4,
          minHeight:68,padding:'2px 0 12px',
          alignItems:'flex-end',
          animation:badAnim?'shake .35s ease':'none',
        }}>
          {displayCards.map((card,idx)=>(
            <CardFace key={card.id} card={card}
              sel={!arrangeMode&&isSel(card)}
              onClick={arrangeMode?undefined:()=>toggleCard(card)}
              levelVal={myLV}
              isDragOver={arrangeMode&&dragOverIdx===idx}
              dragHandlers={arrangeMode?{
                draggable:true,
                onDragStart:()=>onDragStart(idx),
                onDragOver:(e)=>onDragOver(e,idx),
                onDrop:(e)=>onDrop(e,idx),
                onDragEnd,
              }:undefined}/>
          ))}
        </div>

        {/* Action buttons */}
        {!arrangeMode&&isMyTurn&&(
          <div style={{display:'flex',gap:8}}>
            <button onClick={playCards} style={{
              flex:2,padding:'11px',
              background:canPlayIt
                ?'linear-gradient(135deg,#d97706,#f59e0b)'
                :'rgba(255,255,255,.04)',
              color:canPlayIt?'#111':'rgba(255,255,255,.12)',
              border:`1px solid ${canPlayIt?'#f59e0b':'rgba(255,255,255,.06)'}`,
              borderRadius:10,cursor:canPlayIt?'pointer':'default',
              fontWeight:800,fontSize:14,fontFamily:"'Outfit',sans-serif",
              letterSpacing:.5,
              boxShadow:canPlayIt?'0 4px 20px rgba(245,158,11,.4)':'none',
              transition:'all .2s',
            }}>СЫГРАТЬ</button>
            {canPassIt&&(
              <button onClick={pass} style={{
                flex:1,padding:'11px',
                background:'rgba(255,255,255,.04)',
                color:'rgba(255,255,255,.4)',
                border:'1px solid rgba(255,255,255,.08)',
                borderRadius:10,cursor:'pointer',
                fontSize:13,fontFamily:"'Outfit',sans-serif",
                fontWeight:600,transition:'all .2s',
              }}>ПАС</button>
            )}
            {selected.length>0&&(
              <button onClick={()=>{setSelected([]);setChamVal(null);}} style={{
                padding:'11px 14px',background:'rgba(255,255,255,.03)',
                color:'rgba(255,255,255,.2)',
                border:'1px solid rgba(255,255,255,.06)',
                borderRadius:10,cursor:'pointer',fontSize:14,
                transition:'all .2s',
              }}>✕</button>
            )}
          </div>
        )}

        {/* Last log */}
        {log?.length>0&&(
          <div style={{
            marginTop:8,fontSize:10,
            color:'rgba(245,158,11,.4)',
            textAlign:'center',
            overflow:'hidden',
            whiteSpace:'nowrap',textOverflow:'ellipsis',
          }}>
            {log[log.length-1]}
          </div>
        )}
      </div>

      {/* Finished overlay */}
      {phase==='finished'&&(
        <div style={{
          position:'absolute',inset:0,zIndex:20,
          background:'rgba(5,8,16,.92)',
          backdropFilter:'blur(8px)',
          display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',
          animation:'fadeIn .4s ease',padding:24,
        }}>
          <div style={{fontSize:48,marginBottom:8}}>🏆</div>
          <div style={{
            fontSize:22,fontWeight:900,letterSpacing:4,marginBottom:6,
            fontFamily:"'Outfit',sans-serif",
            background:'linear-gradient(135deg,#fcd34d,#f59e0b)',
            WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',
          }}>ПАРТИЯ ОКОНЧЕНА</div>
          <div style={{
            fontSize:10,color:'rgba(255,255,255,.2)',letterSpacing:3,
            fontFamily:"'Outfit',sans-serif",marginBottom:28,
          }}>РЕЗУЛЬТАТЫ</div>

          {[...players].sort((a,b)=>(b.levelIdx??0)-(a.levelIdx??0)).map((p,rank)=>(
            <div key={p.id} style={{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'10px 20px',margin:'4px 0',borderRadius:12,
              width:'100%',maxWidth:290,
              background:rank===0?'rgba(245,158,11,.08)':'rgba(255,255,255,.03)',
              border:`1px solid ${rank===0?'rgba(245,158,11,.25)':'rgba(255,255,255,.05)'}`,
            }}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:12,color:'rgba(255,255,255,.2)',fontWeight:600,width:16}}>
                  {rank===0?'🥇':rank===1?'🥈':rank===2?'🥉':`${rank+1}`}
                </span>
                <span style={{
                  color:P_COLORS[p.seatIndex],fontWeight:700,fontSize:14,
                }}>{p.name}{p.isMe?' (я)':''}</span>
              </div>
              <span style={{
                color:'#f59e0b',fontSize:22,fontWeight:900,
                fontFamily:"'Georgia',serif",
              }}>{p.level}</span>
            </div>
          ))}

          {mySeatIndex===0?(
            <button onClick={()=>socket.emit('newGame',{code:roomCode})} style={{
              marginTop:24,padding:'13px 36px',
              background:'linear-gradient(135deg,#d97706,#f59e0b)',
              color:'#111',border:'none',borderRadius:12,cursor:'pointer',
              fontWeight:800,fontSize:15,
              fontFamily:"'Outfit',sans-serif",letterSpacing:.5,
              boxShadow:'0 4px 24px rgba(245,158,11,.4)',
              transition:'all .2s',
            }}>НОВАЯ ИГРА →</button>
          ):(
            <div style={{marginTop:20,fontSize:12,color:'rgba(255,255,255,.22)',letterSpacing:.5}}>
              Ожидаем хоста...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Root ── */
export default function App(){
  const[screen,setScreen]=useState('lobby');
  const[gs,setGs]=useState(null);
  const[roomCode,setRoomCode]=useState('');
  const[error,setError]=useState('');
  const socketRef=useRef(null);
  const sessionSavedRef=useRef(false);

  useEffect(()=>{
    const socket=io(SERVER_URL,{transports:['websocket','polling']});
    socketRef.current=socket;

    socket.on('connect',()=>{
      const savedCode=localStorage.getItem('sanzhut_room');
      const savedPlayerId=localStorage.getItem('sanzhut_player_id');
      if(savedCode&&savedPlayerId){
        sessionSavedRef.current=true;
        socket.emit('rejoinRoom',{code:savedCode,playerId:savedPlayerId});
      }
    });

    socket.on('roomCreated',({code})=>{
      setRoomCode(code);
      localStorage.setItem('sanzhut_room',code);
      localStorage.setItem('sanzhut_player_id',socket.id);
      sessionSavedRef.current=true;
    });

    socket.on('gameState',(state)=>{
      setGs(state);
      if(state.roomCode) setRoomCode(state.roomCode);
      if(state.phase==='playing'||state.phase==='finished') setScreen('game');
      else if(state.players?.length>0) setScreen('waiting');
      if(!sessionSavedRef.current&&state.roomCode){
        localStorage.setItem('sanzhut_room',state.roomCode);
        localStorage.setItem('sanzhut_player_id',socket.id);
        sessionSavedRef.current=true;
      }
    });

    socket.on('error',(msg)=>{
      setError(msg);
      setTimeout(()=>setError(''),3000);
      if(msg==='Комната не найдена'){
        localStorage.removeItem('sanzhut_room');
        localStorage.removeItem('sanzhut_player_id');
        sessionSavedRef.current=false;
      }
    });

    return()=>socket.disconnect();
  },[]);

  function handleCreate(name){setError('');socketRef.current?.emit('createRoom',{playerName:name});}
  function handleJoin(name,code){setError('');socketRef.current?.emit('joinRoom',{playerName:name,code});}

  if(screen==='lobby') return <Lobby onCreate={handleCreate} onJoin={handleJoin} error={error}/>;
  if(screen==='waiting'&&gs) return <WaitingRoom roomCode={roomCode||gs?.roomCode} players={gs.players}/>;
  if(screen==='game'&&gs) return <Game gs={gs} socket={socketRef.current} roomCode={roomCode||gs?.roomCode}/>;
  return(
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(160deg,#080d1a,#050810)',
      display:'flex',alignItems:'center',justifyContent:'center',
      color:'#f59e0b',fontSize:16,fontFamily:"'Outfit',sans-serif",
      letterSpacing:3,
    }}>
      Подключение...
    </div>
  );
}
