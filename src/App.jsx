import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "https://sanzhut-server-production.up.railway.app";

const RED_SUITS  = new Set(['♥','♦']);
const P_COLORS   = ['#e05c5c','#5b9cf6','#52c97a','#f0a24a'];
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

/* ── Card ── */
function CardFace({card,sel,onClick,sm,levelVal,dragHandlers,isDragOver,faceDown}){
  if(faceDown) return(
    <div style={{
      width:sm?26:42,height:sm?36:60,
      background:'linear-gradient(145deg,#1a5c2a,#0d3316)',
      border:'1.5px solid rgba(255,255,255,.12)',
      borderRadius:sm?4:7,flexShrink:0,
      boxShadow:'0 2px 5px rgba(0,0,0,.5)',
      display:'flex',alignItems:'center',justifyContent:'center',
    }}>
      <div style={{width:'70%',height:'70%',border:'1px solid rgba(255,255,255,.08)',borderRadius:3}}/>
    </div>
  );
  let top,bot,color,bg,bord;
  if(card.type==='joker_black'){top='J';bot='♟';color='#222';bg='linear-gradient(145deg,#eee,#ccc)';bord='#888';}
  else if(card.type==='joker_red'){top='J';bot='♦';color='#8b0000';bg='linear-gradient(145deg,#ffe0e0,#ffb0b0)';bord='#cc4444';}
  else if(card.type==='chameleon'){top='✦';bot='CH';color='#6a0dad';bg='linear-gradient(145deg,#f3e6ff,#ddb8ff)';bord='#9b59b6';}
  else{
    top=card.value;bot=card.suit;
    const red=RED_SUITS.has(card.suit);
    color=red?'#b91c1c':'#1a1a2e';
    bg='linear-gradient(145deg,#fffef8,#faf4e0)';
    bord=red?'#e8b4b4':'#c8c4a8';
  }
  const isLv=card.value===levelVal&&card.type==='regular'&&!sm;
  const W=sm?26:42, H=sm?36:60;
  return(
    <div onClick={onClick} {...(dragHandlers||{})} style={{
      width:W,height:H,background:bg,
      border:`2px solid ${isDragOver?'#60a5fa':sel?'#f0c040':isLv?'#52c97a':bord}`,
      borderRadius:sm?4:7,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      cursor:dragHandlers?'grab':onClick?'pointer':'default',
      transform:sel?'translateY(-12px) scale(1.05)':isDragOver?'scale(1.06)':'none',
      transition:'transform .14s cubic-bezier(.34,1.56,.64,1),box-shadow .14s,border-color .14s',
      boxShadow:isDragOver?'0 0 0 2px #60a5fa':sel?'0 8px 20px rgba(240,192,64,.5)':isLv?'0 2px 8px rgba(82,201,122,.3)':'0 2px 5px rgba(0,0,0,.35)',
      color,fontWeight:'bold',userSelect:'none',flexShrink:0,position:'relative',
      fontFamily:"'Georgia',serif",
    }}>
      {isLv&&<div style={{position:'absolute',top:2,right:2,width:5,height:5,
        borderRadius:'50%',background:'#52c97a',boxShadow:'0 0 5px #52c97a'}}/>}
      <div style={{fontSize:sm?9:top.length>1?10:15,lineHeight:1.1,fontWeight:'900'}}>{top}</div>
      {bot&&<div style={{fontSize:sm?8:11,lineHeight:1,opacity:.88}}>{bot}</div>}
    </div>
  );
}

/* ── Player Seat ── */
function Seat({player,isActive,cardCount,finished,position}){
  if(!player) return <div style={{width:60}}/>;
  const color=P_COLORS[player.seatIndex??0];
  const isTop=position==='top';
  const isLeft=position==='left';
  const isRight=position==='right';

  const cards=Array.from({length:Math.min(cardCount,8)});
  const extra=cardCount>8?cardCount-8:0;

  return(
    <div style={{
      display:'flex',
      flexDirection: isTop?'column':'row',
      alignItems:'center',gap:4,
      opacity:finished?.45:1,
    }}>
      {/* Badge */}
      <div style={{
        padding:'4px 8px',borderRadius:16,
        background:isActive?`${color}1a`:'rgba(0,0,0,.45)',
        border:`1.5px solid ${isActive?color:finished?color+'33':'rgba(255,255,255,.08)'}`,
        boxShadow:isActive?`0 0 14px ${color}55`:'none',
        display:'flex',alignItems:'center',gap:5,
        transition:'all .3s',flexShrink:0,
        order: isLeft?1:isRight?0:0,
      }}>
        {isActive&&<div style={{width:5,height:5,borderRadius:'50%',background:color,animation:'pulse 1s infinite'}}/>}
        <span style={{fontSize:10,color:isActive?color:'rgba(255,255,255,.45)',fontWeight:'bold',
          whiteSpace:'nowrap',maxWidth:56,overflow:'hidden',textOverflow:'ellipsis'}}>
          {player.name}
        </span>
        <span style={{fontSize:13,color:'#f0c040',fontWeight:'bold',fontFamily:"'Georgia',serif"}}>{player.level}</span>
        {finished&&<span style={{fontSize:9,color:color}}>✓</span>}
      </div>

      {/* Face-down cards */}
      <div style={{
        display:'flex',
        flexDirection: isTop?'row':'column',
        gap:2,flexShrink:0,
        order: isLeft?0:isRight?1:1,
      }}>
        {cards.map((_,i)=>(
          <CardFace key={i} card={{}} faceDown sm/>
        ))}
        {extra>0&&<div style={{fontSize:8,color:'rgba(255,255,255,.3)',textAlign:'center',alignSelf:'center'}}>+{extra}</div>}
      </div>
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

  const inp={padding:'13px 16px',width:'100%',background:'rgba(255,255,255,.06)',
    color:'#f0e6c8',border:'1px solid rgba(255,255,255,.12)',borderRadius:10,
    fontSize:16,fontFamily:"'Georgia',serif",outline:'none'};
  const btn=(on)=>({padding:'14px',width:'100%',
    background:on?'linear-gradient(135deg,#c8920e,#f0c040)':'rgba(255,255,255,.05)',
    color:on?'#111':'rgba(255,255,255,.2)',
    border:`1px solid ${on?'#f0c040':'rgba(255,255,255,.1)'}`,
    borderRadius:12,cursor:on?'pointer':'default',fontWeight:'bold',fontSize:16,
    fontFamily:"'Georgia',serif",boxShadow:on?'0 4px 20px rgba(240,192,64,.35)':'none',transition:'all .2s'});

  return(
    <div style={{minHeight:'100vh',
      background:'radial-gradient(ellipse at 50% 0%,#0d2a10 0%,#060e07 70%)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:24,fontFamily:"'Georgia',serif",color:'#f0e6c8'}}>
      <div style={{textAlign:'center',marginBottom:44}}>
        <div style={{fontSize:34,fontWeight:'bold',color:'#f0c040',letterSpacing:6,
          textShadow:'0 0 60px rgba(240,192,64,.45)'}}>🃏 САНЖУТ</div>
        <div style={{fontSize:10,color:'rgba(240,192,64,.3)',letterSpacing:4,marginTop:5}}>ОНЛАЙН · 4 ИГРОКА</div>
      </div>
      {error&&<div style={{marginBottom:14,padding:'9px 16px',background:'rgba(192,57,43,.18)',
        border:'1px solid rgba(192,57,43,.35)',borderRadius:8,fontSize:12,color:'#ff9080'}}>{error}</div>}
      <div style={{width:'100%',maxWidth:300,display:'flex',flexDirection:'column',gap:10}}>
        {!mode?(
          <>
            <button onClick={()=>setMode('create')} style={btn(true)}>СОЗДАТЬ КОМНАТУ</button>
            <button onClick={()=>setMode('join')} style={{...btn(false),color:'rgba(255,255,255,.5)',border:'1px solid rgba(255,255,255,.14)'}}>ВОЙТИ В КОМНАТУ</button>
          </>
        ):mode==='create'?(
          <>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Твоё имя" maxLength={16} style={inp}/>
            <button onClick={()=>name.trim()&&onCreate(name.trim())} style={btn(!!name.trim())}>СОЗДАТЬ</button>
            <button onClick={()=>setMode(null)} style={{padding:'10px',background:'transparent',color:'rgba(255,255,255,.25)',border:'none',cursor:'pointer',fontSize:13}}>← Назад</button>
          </>
        ):(
          <>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Твоё имя" maxLength={16} style={inp}/>
            <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="КОД" maxLength={6}
              style={{...inp,fontSize:24,letterSpacing:8,textAlign:'center',color:'#f0c040',border:'1px solid rgba(240,192,64,.22)'}}/>
            <button onClick={()=>name.trim()&&code.trim()&&onJoin(name.trim(),code.trim())} style={btn(!!(name.trim()&&code.trim()))}>ВОЙТИ</button>
            <button onClick={()=>setMode(null)} style={{padding:'10px',background:'transparent',color:'rgba(255,255,255,.25)',border:'none',cursor:'pointer',fontSize:13}}>← Назад</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Waiting ── */
function WaitingRoom({roomCode,players}){
  return(
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 50% 0%,#0d2a10,#060e07)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:24,fontFamily:"'Georgia',serif",color:'#f0e6c8'}}>
      <div style={{fontSize:22,fontWeight:'bold',color:'#f0c040',marginBottom:4}}>🃏 САНЖУТ</div>
      <div style={{fontSize:11,color:'rgba(255,255,255,.3)',marginBottom:32}}>Ожидаем игроков...</div>
      <div style={{background:'rgba(240,192,64,.07)',border:'2px solid rgba(240,192,64,.22)',
        borderRadius:16,padding:'18px 36px',marginBottom:30,textAlign:'center'}}>
        <div style={{fontSize:9,color:'rgba(240,192,64,.4)',letterSpacing:3,marginBottom:8}}>КОД КОМНАТЫ</div>
        <div style={{fontSize:42,fontWeight:'bold',color:'#f0c040',letterSpacing:10,
          textShadow:'0 0 30px rgba(240,192,64,.4)'}}>{roomCode}</div>
        <div style={{fontSize:10,color:'rgba(255,255,255,.22)',marginTop:8}}>Отправь этот код друзьям</div>
      </div>
      <div style={{width:'100%',maxWidth:280}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,
            padding:'10px 14px',margin:'4px 0',borderRadius:10,
            background:players[i]?`rgba(${P_COLORS[i].slice(1).match(/../g).map(x=>parseInt(x,16)).join(',')},0.07)`:'rgba(255,255,255,.02)',
            border:`1px solid ${players[i]?P_COLORS[i]+'2a':'rgba(255,255,255,.05)'}`}}>
            <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,
              background:players[i]?P_COLORS[i]:'rgba(255,255,255,.1)',
              boxShadow:players[i]?`0 0 7px ${P_COLORS[i]}`:'none'}}/>
            <span style={{color:players[i]?'#f0e6c8':'rgba(255,255,255,.18)',fontSize:14}}>
              {players[i]?.name||`Ожидаем игрока ${i+1}...`}
            </span>
          </div>
        ))}
      </div>
      <div style={{marginTop:22,fontSize:10,color:'rgba(255,255,255,.18)'}}>Игра начнётся автоматически</div>
    </div>
  );
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
  const myColor=P_COLORS[mySeatIndex]||'#5b9cf6';

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

  // Relative seat mapping: I am always "bottom"
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
      background:'radial-gradient(ellipse at 50% 20%,#0d2010 0%,#060e07 80%)',
      color:'#f0e6c8',fontFamily:"'Georgia',serif",
      display:'flex',flexDirection:'column',
      maxWidth:500,margin:'0 auto',position:'relative',
    }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
        @keyframes shake{0%,100%{transform:none}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes popIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
      `}</style>

      {/* TOP PLAYER */}
      <div style={{display:'flex',justifyContent:'center',padding:'10px 12px 0',zIndex:2}}>
        <Seat {...top} position="top"/>
      </div>

      {/* MIDDLE ROW: left + table + right */}
      <div style={{flex:1,display:'flex',alignItems:'center',padding:'6px',gap:4,minHeight:0}}>

        {/* LEFT */}
        <div style={{display:'flex',alignItems:'center',flexShrink:0}}>
          <Seat {...left} position="left"/>
        </div>

        {/* OVAL TABLE */}
        <div style={{flex:1,position:'relative',alignSelf:'stretch',display:'flex',alignItems:'center',justifyContent:'center'}}>
          {/* Felt surface */}
          <div style={{
            position:'absolute',inset:0,
            background:'radial-gradient(ellipse at 50% 42%,#226b32 0%,#174d23 45%,#0f3318 100%)',
            borderRadius:'45%',
            border:'4px solid #0a2010',
            boxShadow:`
              inset 0 6px 30px rgba(0,0,0,.5),
              inset 0 0 0 2px rgba(255,255,255,.04),
              0 8px 40px rgba(0,0,0,.6)
            `,
          }}/>
          {/* Inner decorative ring */}
          <div style={{
            position:'absolute',inset:12,
            borderRadius:'45%',
            border:'1px solid rgba(255,255,255,.05)',
            pointerEvents:'none',
          }}/>

          {/* Table content */}
          <div style={{position:'relative',zIndex:2,display:'flex',flexDirection:'column',
            alignItems:'center',justifyContent:'center',gap:8,padding:16,width:'100%'}}>

            {table?(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,animation:'popIn .25s ease'}}>
                <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:3,maxWidth:180}}>
                  {table.cards.map(c=>(
                    <CardFace key={c.id} card={c} levelVal={myLV} sm/>
                  ))}
                </div>
                <div style={{padding:'3px 12px',
                  background:'rgba(0,0,0,.5)',borderRadius:20,
                  border:'1px solid rgba(240,192,64,.18)',
                  fontSize:10,color:'rgba(240,192,64,.8)'}}>
                  {CLABELS[table.combo?.type]} · {players[table.playedBy]?.name}
                </div>
              </div>
            ):(
              <div style={{color:'rgba(255,255,255,.18)',fontSize:11,fontStyle:'italic',textAlign:'center',lineHeight:1.5}}>
                {isMyTurn?'Твой ход\nходи что хочешь':''}
              </div>
            )}
          </div>

          {/* Room code watermark */}
          <div style={{position:'absolute',bottom:6,right:14,fontSize:8,
            color:'rgba(255,255,255,.1)',letterSpacing:2,fontFamily:'monospace'}}>{roomCode}</div>
        </div>

        {/* RIGHT */}
        <div style={{display:'flex',alignItems:'center',flexShrink:0}}>
          <Seat {...right} position="right"/>
        </div>
      </div>

      {/* MY AREA */}
      <div style={{
        padding:'8px 10px 12px',
        background:'linear-gradient(0deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,0) 100%)',
        borderTop:'1px solid rgba(255,255,255,.04)',
      }}>
        {/* My info */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            {isMyTurn&&<div style={{width:6,height:6,borderRadius:'50%',
              background:myColor,boxShadow:`0 0 8px ${myColor}`,animation:'pulse 1s infinite'}}/>}
            <span style={{fontSize:12,fontWeight:'bold',
              color:isMyTurn?myColor:'rgba(255,255,255,.4)'}}>
              {me?.name||'Я'}
            </span>
            <span style={{fontSize:15,color:'#f0c040',fontWeight:'bold',
              fontFamily:"'Georgia',serif",textShadow:'0 0 10px rgba(240,192,64,.4)'}}>
              {myLV}
            </span>
            <span style={{fontSize:10,color:'rgba(255,255,255,.2)'}}>{myCards.length}к</span>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={()=>{setArrangeMode(m=>!m);setSelected([]);setChamVal(null);}} style={{
              padding:'3px 9px',fontSize:10,
              background:arrangeMode?`${myColor}28`:'rgba(255,255,255,.05)',
              color:arrangeMode?myColor:'rgba(255,255,255,.3)',
              border:`1px solid ${arrangeMode?myColor:'rgba(255,255,255,.09)'}`,
              borderRadius:5,cursor:'pointer',fontFamily:"'Georgia',serif"}}>
              {arrangeMode?'✓ Готово':'⠿ Порядок'}
            </button>
          </div>
        </div>

        {/* Chameleon */}
        {!arrangeMode&&hasChamSel&&(
          <div style={{marginBottom:6,display:'flex',alignItems:'center',flexWrap:'wrap',gap:3,
            padding:'5px 8px',background:'rgba(107,33,168,.1)',borderRadius:7,
            border:'1px solid rgba(155,89,182,.18)'}}>
            <span style={{fontSize:10,color:'#c39bd3'}}>✦=</span>
            {CHAM_OK.map(v=>(
              <button key={v} onClick={()=>setChamVal(v)} style={{
                padding:'2px 6px',background:chamVal===v?'rgba(155,89,182,.5)':'rgba(155,89,182,.09)',
                color:chamVal===v?'#fff':'#c39bd3',
                border:`1px solid ${chamVal===v?'#9b59b6':'rgba(155,89,182,.2)'}`,
                borderRadius:4,cursor:'pointer',fontSize:10,fontFamily:"'Georgia',serif"}}>
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Combo status */}
        {!arrangeMode&&selected.length>0&&(
          <div style={{fontSize:10,marginBottom:5,display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:5,height:5,borderRadius:'50%',flexShrink:0,
              background:canPlayIt?'#52c97a':'#e05c5c',
              boxShadow:`0 0 6px ${canPlayIt?'#52c97a':'#e05c5c'}`}}/>
            <span style={{color:canPlayIt?'#86efac':'#fca5a5'}}>
              {curCombo?`${CLABELS[curCombo.type]}${canPlayIt?' ✓':' — не бьёт стол'}`:' Недопустимая комбинация'}
            </span>
          </div>
        )}

        {/* Cards */}
        <div style={{display:'flex',flexWrap:'wrap',gap:3,
          minHeight:62,padding:'2px 0 14px',alignItems:'flex-end'}}>
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
          <div style={{display:'flex',gap:7,animation:badAnim?'shake .35s ease':'none'}}>
            <button onClick={playCards} style={{
              flex:2,padding:'10px',
              background:canPlayIt?'linear-gradient(135deg,#c8920e,#f0c040)':'rgba(255,255,255,.04)',
              color:canPlayIt?'#111':'rgba(255,255,255,.12)',
              border:`1px solid ${canPlayIt?'#f0c040':'rgba(255,255,255,.07)'}`,
              borderRadius:10,cursor:canPlayIt?'pointer':'default',
              fontWeight:'bold',fontSize:14,fontFamily:"'Georgia',serif",
              boxShadow:canPlayIt?'0 4px 18px rgba(240,192,64,.4)':'none',
              transition:'all .2s'}}>
              СЫГРАТЬ
            </button>
            {canPassIt&&(
              <button onClick={pass} style={{
                flex:1,padding:'10px',background:'rgba(255,255,255,.04)',
                color:'rgba(255,255,255,.35)',border:'1px solid rgba(255,255,255,.09)',
                borderRadius:10,cursor:'pointer',fontSize:13,fontFamily:"'Georgia',serif"}}>
                ПАС
              </button>
            )}
            {selected.length>0&&(
              <button onClick={()=>{setSelected([]);setChamVal(null);}} style={{
                padding:'10px 12px',background:'transparent',
                color:'rgba(255,255,255,.2)',border:'1px solid rgba(255,255,255,.06)',
                borderRadius:10,cursor:'pointer',fontSize:12}}>✕</button>
            )}
          </div>
        )}

        {/* Last log message */}
        {log?.length>0&&(
          <div style={{marginTop:7,fontSize:10,color:'rgba(220,180,80,.45)',
            textAlign:'center',height:13,overflow:'hidden'}}>
            {log[log.length-1]}
          </div>
        )}
      </div>

      {/* Finished overlay */}
      {phase==='finished'&&(
        <div style={{position:'absolute',inset:0,zIndex:20,
          background:'rgba(0,0,0,.88)',backdropFilter:'blur(4px)',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
          animation:'fadeIn .4s ease',padding:24}}>
          <div style={{fontSize:40,marginBottom:6}}>🏆</div>
          <div style={{fontSize:20,color:'#f0c040',fontWeight:'bold',
            letterSpacing:3,marginBottom:20}}>ПАРТИЯ ОКОНЧЕНА</div>
          {[...players].sort((a,b)=>b.levelIdx-a.levelIdx).map((p,rank)=>(
            <div key={p.id} style={{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'9px 20px',margin:'4px 0',borderRadius:10,width:'100%',maxWidth:280,
              background:rank===0?'rgba(240,192,64,.1)':'rgba(255,255,255,.03)',
              border:`1px solid ${rank===0?'rgba(240,192,64,.3)':'rgba(255,255,255,.05)'}`}}>
              <span style={{color:P_COLORS[p.seatIndex],fontWeight:'bold',fontSize:14}}>
                {p.name}{p.isMe?' (я)':''}
              </span>
              <span style={{color:'#f0c040',fontSize:20,fontWeight:'bold'}}>{p.level}</span>
            </div>
          ))}
          {mySeatIndex===0?(
            <button onClick={()=>socket.emit('newGame',{code:roomCode})} style={{
              marginTop:22,padding:'12px 34px',
              background:'linear-gradient(135deg,#c8920e,#f0c040)',
              color:'#111',border:'none',borderRadius:10,cursor:'pointer',
              fontWeight:'bold',fontSize:15,fontFamily:"'Georgia',serif",
              boxShadow:'0 4px 22px rgba(240,192,64,.4)'}}>
              НОВАЯ ИГРА →
            </button>
          ):(
            <div style={{marginTop:20,fontSize:12,color:'rgba(255,255,255,.28)'}}>
              Ожидаем хоста для новой игры...
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

  useEffect(()=>{
    const socket=io(SERVER_URL,{transports:['websocket','polling']});
    socketRef.current=socket;
    socket.on('roomCreated',({code})=>setRoomCode(code));
    socket.on('gameState',(state)=>{
      setGs(state);
      if(state.phase==='playing'||state.phase==='finished') setScreen('game');
      else if(state.players?.length>0) setScreen('waiting');
    });
    socket.on('error',(msg)=>{setError(msg);setTimeout(()=>setError(''),3000);});
    return()=>socket.disconnect();
  },[]);

  function handleCreate(name){setError('');socketRef.current?.emit('createRoom',{playerName:name});}
  function handleJoin(name,code){setError('');socketRef.current?.emit('joinRoom',{playerName:name,code});}

  if(screen==='lobby') return <Lobby onCreate={handleCreate} onJoin={handleJoin} error={error}/>;
  if(screen==='waiting'&&gs) return <WaitingRoom roomCode={roomCode||gs?.roomCode} players={gs.players}/>;
  if(screen==='game'&&gs) return <Game gs={gs} socket={socketRef.current} roomCode={roomCode||gs?.roomCode}/>;
  return(
    <div style={{minHeight:'100vh',background:'#060e07',display:'flex',alignItems:'center',
      justifyContent:'center',color:'#f0c040',fontSize:16,fontFamily:"'Georgia',serif"}}>
      Подключение...
    </div>
  );
}
