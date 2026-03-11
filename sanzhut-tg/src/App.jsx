import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

// ⚠️ REPLACE THIS with your Railway server URL after deploy
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

// ── Combo detection (client-side, for UI validation only) ──
const SEQ_BAD = new Set(['2','3','JB','JR']);
function detectCombo(cards, cv=null){
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

// ── Card component ──
function CardFace({card,sel,onClick,sm,levelVal,dragHandlers,isDragOver}){
  let top,bot,color,bg,bord;
  if(card.type==='joker_black'){top='🃏';bot='B';color='#222';bg='linear-gradient(145deg,#e8e8e8,#ccc)';bord='#888';}
  else if(card.type==='joker_red'){top='🃏';bot='R';color='#8b0000';bg='linear-gradient(145deg,#ffe0e0,#ffb0b0)';bord='#cc4444';}
  else if(card.type==='chameleon'){top='✦';bot='CH';color='#6a0dad';bg='linear-gradient(145deg,#f3e6ff,#ddb8ff)';bord='#9b59b6';}
  else{top=card.value;bot=card.suit;const red=RED_SUITS.has(card.suit);color=red?'#b91c1c':'#1a1a2e';bg='linear-gradient(145deg,#fffef8,#faf4e0)';bord=red?'#e8b4b4':'#c8c4a8';}
  const isLv=card.value===levelVal&&card.type==='regular'&&!sm;
  const W=sm?40:56,H=sm?56:80;
  return(
    <div onClick={onClick} {...(dragHandlers||{})} style={{
      width:W,height:H,background:bg,
      border:`2px solid ${isDragOver?'#60a5fa':sel?'#f0c040':isLv?'#52c97a':bord}`,
      borderRadius:sm?6:9,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      cursor:dragHandlers?'grab':onClick?'pointer':'default',
      transform:sel?'translateY(-16px) scale(1.06)':isDragOver?'scale(1.08)':'none',
      transition:'transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s,border-color .15s',
      boxShadow:isDragOver?'0 0 0 2px #60a5fa,0 8px 24px rgba(96,165,250,.4)':sel?'0 12px 30px rgba(240,192,64,.5),0 0 0 1px rgba(240,192,64,.4)':isLv?'0 3px 10px rgba(82,201,122,.3)':'0 3px 8px rgba(0,0,0,.3)',
      color,fontWeight:'bold',userSelect:'none',flexShrink:0,position:'relative',fontFamily:"'Georgia',serif",
    }}>
      {isLv&&<div style={{position:'absolute',top:3,right:3,width:7,height:7,borderRadius:'50%',background:'#52c97a',boxShadow:'0 0 8px #52c97a88'}}/>}
      <div style={{fontSize:sm?11:top.length>1?12:18,lineHeight:1.1,fontWeight:'900'}}>{top}</div>
      {bot&&<div style={{fontSize:sm?10:13,lineHeight:1,opacity:.9}}>{bot}</div>}
    </div>
  );
}

// ── Lobby screen ──
function Lobby({onCreate,onJoin}){
  const [name,setName]=useState('');
  const [code,setCode]=useState('');
  const [mode,setMode]=useState(null);
  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0c1e0d,#06120a)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:20,fontFamily:"'Georgia',serif",color:'#f0e6c8'}}>
      <div style={{fontSize:28,fontWeight:'bold',color:'#f0c040',letterSpacing:5,
        textShadow:'0 0 40px rgba(240,192,64,.4)',marginBottom:4}}>🃏 САНЖУТ</div>
      <div style={{fontSize:10,color:'rgba(240,192,64,.35)',letterSpacing:3,marginBottom:40}}>
        ОНЛАЙН · 4 ИГРОКА
      </div>
      {!mode?(
        <div style={{display:'flex',flexDirection:'column',gap:12,width:'100%',maxWidth:280}}>
          <button onClick={()=>setMode('create')} style={{
            padding:'14px',background:'linear-gradient(135deg,#c8920e,#f0c040)',
            color:'#111',border:'none',borderRadius:12,cursor:'pointer',
            fontWeight:'bold',fontSize:16,fontFamily:"'Georgia',serif",letterSpacing:1,
            boxShadow:'0 4px 22px rgba(240,192,64,.4)'}}>
            СОЗДАТЬ КОМНАТУ
          </button>
          <button onClick={()=>setMode('join')} style={{
            padding:'14px',background:'rgba(255,255,255,.06)',
            color:'rgba(255,255,255,.7)',border:'1px solid rgba(255,255,255,.15)',
            borderRadius:12,cursor:'pointer',fontSize:16,fontFamily:"'Georgia',serif"}}>
            ВОЙТИ В КОМНАТУ
          </button>
        </div>
      ):mode==='create'?(
        <div style={{display:'flex',flexDirection:'column',gap:12,width:'100%',maxWidth:280}}>
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder="Твоё имя" maxLength={16}
            style={{padding:'12px 14px',background:'rgba(255,255,255,.07)',
              color:'#f0e6c8',border:'1px solid rgba(255,255,255,.15)',
              borderRadius:10,fontSize:16,fontFamily:"'Georgia',serif",outline:'none'}}/>
          <button onClick={()=>name.trim()&&onCreate(name.trim())} style={{
            padding:'14px',background:name.trim()?'linear-gradient(135deg,#c8920e,#f0c040)':'rgba(255,255,255,.04)',
            color:name.trim()?'#111':'rgba(255,255,255,.2)',border:'none',borderRadius:12,
            cursor:name.trim()?'pointer':'default',fontWeight:'bold',fontSize:16,
            fontFamily:"'Georgia',serif"}}>
            СОЗДАТЬ
          </button>
          <button onClick={()=>setMode(null)} style={{padding:'10px',background:'transparent',
            color:'rgba(255,255,255,.3)',border:'none',cursor:'pointer',fontSize:13}}>← Назад</button>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:12,width:'100%',maxWidth:280}}>
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder="Твоё имя" maxLength={16}
            style={{padding:'12px 14px',background:'rgba(255,255,255,.07)',
              color:'#f0e6c8',border:'1px solid rgba(255,255,255,.15)',
              borderRadius:10,fontSize:16,fontFamily:"'Georgia',serif",outline:'none'}}/>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
            placeholder="КОД КОМНАТЫ" maxLength={6}
            style={{padding:'12px 14px',background:'rgba(255,255,255,.07)',
              color:'#f0c040',border:'1px solid rgba(240,192,64,.25)',
              borderRadius:10,fontSize:20,fontFamily:"'Georgia',serif",
              outline:'none',letterSpacing:4,textAlign:'center'}}/>
          <button onClick={()=>name.trim()&&code.trim()&&onJoin(name.trim(),code.trim())} style={{
            padding:'14px',background:(name.trim()&&code.trim())?'linear-gradient(135deg,#c8920e,#f0c040)':'rgba(255,255,255,.04)',
            color:(name.trim()&&code.trim())?'#111':'rgba(255,255,255,.2)',border:'none',borderRadius:12,
            cursor:(name.trim()&&code.trim())?'pointer':'default',fontWeight:'bold',fontSize:16,
            fontFamily:"'Georgia',serif"}}>
            ВОЙТИ
          </button>
          <button onClick={()=>setMode(null)} style={{padding:'10px',background:'transparent',
            color:'rgba(255,255,255,.3)',border:'none',cursor:'pointer',fontSize:13}}>← Назад</button>
        </div>
      )}
    </div>
  );
}

// ── Waiting room ──
function WaitingRoom({roomCode,players,isHost}){
  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0c1e0d,#06120a)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:20,fontFamily:"'Georgia',serif",color:'#f0e6c8'}}>
      <div style={{fontSize:22,fontWeight:'bold',color:'#f0c040',marginBottom:6}}>🃏 САНЖУТ</div>
      <div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginBottom:30}}>Ожидаем игроков...</div>
      <div style={{background:'rgba(240,192,64,.08)',border:'2px solid rgba(240,192,64,.3)',
        borderRadius:14,padding:'16px 32px',marginBottom:28,textAlign:'center'}}>
        <div style={{fontSize:11,color:'rgba(240,192,64,.5)',letterSpacing:3,marginBottom:6}}>КОД КОМНАТЫ</div>
        <div style={{fontSize:36,fontWeight:'bold',color:'#f0c040',letterSpacing:8}}>{roomCode}</div>
        <div style={{fontSize:11,color:'rgba(255,255,255,.3)',marginTop:6}}>Отправь этот код друзьям</div>
      </div>
      <div style={{width:'100%',maxWidth:300}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,
            padding:'10px 14px',margin:'4px 0',borderRadius:10,
            background:players[i]?`rgba(${P_COLORS[i].slice(1).match(/../g).map(x=>parseInt(x,16)).join(',')},0.1)`:'rgba(255,255,255,.03)',
            border:`1px solid ${players[i]?P_COLORS[i]+'44':'rgba(255,255,255,.06)'}`}}>
            <div style={{width:8,height:8,borderRadius:'50%',
              background:players[i]?P_COLORS[i]:'rgba(255,255,255,.1)'}}/>
            <span style={{color:players[i]?'#f0e6c8':'rgba(255,255,255,.2)',fontSize:14}}>
              {players[i]?.name||`Ожидаем игрока ${i+1}...`}
            </span>
          </div>
        ))}
      </div>
      <div style={{marginTop:24,fontSize:12,color:'rgba(255,255,255,.25)'}}>
        Игра начнётся автоматически когда зайдут все 4 игрока
      </div>
    </div>
  );
}

// ── Main Game ──
function Game({gs,socket,roomCode,myId}){
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

  // Keep card order in sync
  useEffect(()=>{
    if(!cardOrder||cardOrder.length!==myCards.length){
      setCardOrder(sortCards(myCards).map(c=>c.id));
    }
  },[myCards.length]);

  const existingIds=new Set(myCards.map(c=>c.id));
  const cardById=Object.fromEntries(myCards.map(c=>[c.id,c]));
  const orderedCards=(cardOrder||[]).filter(id=>existingIds.has(id)).map(id=>cardById[id]);
  const displayCards=orderedCards.length===myCards.length?orderedCards:sortCards(myCards);

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
    setSelected(ns);
    if(!ns.some(c=>c.type==='chameleon')) setChamVal(null);
  }

  function playCards(){
    if(!canPlayIt){bad();return;}
    socket.emit('playCards',{code:roomCode,cardIds:selected.map(c=>c.id),chamVal});
    setSelected([]);setChamVal(null);setArrangeMode(false);
  }

  function pass(){
    socket.emit('pass',{code:roomCode});
    setSelected([]);setChamVal(null);setArrangeMode(false);
  }

  function onDragStart(idx){dragIdx.current=idx;}
  function onDragOver(e,idx){e.preventDefault();setDragOverIdx(idx);}
  function onDrop(e,toIdx){
    e.preventDefault();
    const fromIdx=dragIdx.current;
    if(fromIdx===null||fromIdx===toIdx){setDragOverIdx(null);return;}
    const order=[...displayCards.map(c=>c.id)];
    const item=order.splice(fromIdx,1)[0];
    order.splice(toIdx,0,item);
    setCardOrder(order);
    dragIdx.current=null;setDragOverIdx(null);
  }
  function onDragEnd(){dragIdx.current=null;setDragOverIdx(null);}

  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0c1e0d,#06120a)',
      color:'#f0e6c8',fontFamily:"'Georgia',serif",padding:'10px 10px 24px',
      display:'flex',flexDirection:'column',alignItems:'center',gap:10,maxWidth:740,margin:'0 auto'}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes shake{0%,100%{transform:none}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
      `}</style>

      {/* Header */}
      <div style={{width:'100%',display:'flex',justifyContent:'space-between',
        alignItems:'center',padding:'6px 0 10px',borderBottom:'1px solid rgba(240,192,64,.18)'}}>
        <div>
          <div style={{fontSize:20,fontWeight:'bold',color:'#f0c040',letterSpacing:4}}>🃏 САНЖУТ</div>
          <div style={{fontSize:9,color:'rgba(240,192,64,.3)',letterSpacing:2}}>ОНЛАЙН · {roomCode}</div>
        </div>
        {phase==='finished'&&mySeatIndex===0&&(
          <button onClick={()=>socket.emit('newGame',{code:roomCode})} style={{
            padding:'7px 14px',background:'linear-gradient(135deg,#c8920e,#f0c040)',
            color:'#111',border:'none',borderRadius:8,cursor:'pointer',
            fontWeight:'bold',fontSize:12,fontFamily:"'Georgia',serif"}}>
            НОВАЯ ИГРА
          </button>
        )}
      </div>

      {/* Players */}
      <div style={{display:'flex',gap:6,width:'100%'}}>
        {players.map((p,i)=>(
          <div key={i} style={{flex:1,borderRadius:10,padding:'8px 4px',textAlign:'center',
            background:currentPlayer===i&&phase==='playing'?`linear-gradient(160deg,${P_COLORS[i]}18,${P_COLORS[i]}06)`:'rgba(255,255,255,.03)',
            border:`1.5px solid ${currentPlayer===i&&phase==='playing'?P_COLORS[i]:finished.includes(i)?P_COLORS[i]+'55':'rgba(255,255,255,.06)'}`,
            opacity:finished.includes(i)?.5:1,position:'relative',overflow:'hidden'}}>
            {currentPlayer===i&&phase==='playing'&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${P_COLORS[i]},transparent)`,animation:'pulse 2s infinite'}}/>}
            <div style={{fontSize:9,color:p.isMe?'#f0c040':P_COLORS[i],fontWeight:'bold',letterSpacing:.5,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',padding:'0 2px'}}>
              {p.name}{p.isMe?' (я)':''} {finished.includes(i)?'✓':currentPlayer===i&&phase==='playing'?'▶':''}
            </div>
            <div style={{fontSize:22,color:'#f0c040',fontWeight:'bold',lineHeight:1.1}}>{p.level}</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,.2)'}}>{p.cardCount}к</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{width:'100%',borderRadius:14,padding:'16px 20px',
        background:'radial-gradient(ellipse at 50% 70%,rgba(0,55,20,.7),rgba(0,18,7,.5))',
        border:'1px solid rgba(240,192,64,.14)',boxShadow:'inset 0 4px 28px rgba(0,0,0,.55)',
        minHeight:110,display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
        <div style={{fontSize:9,color:'rgba(240,192,64,.28)',letterSpacing:3}}>СТОЛ</div>
        {table?(
          <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',alignItems:'center',gap:6,animation:'fadeIn .25s ease'}}>
            {table.cards.map(c=><CardFace key={c.id} card={c} levelVal={myLV}/>)}
            <div style={{marginLeft:10,padding:'5px 14px',background:'rgba(240,192,64,.07)',borderRadius:20,border:'1px solid rgba(240,192,64,.18)',fontSize:12,color:'#f0c040aa',alignSelf:'center'}}>
              {CLABELS[table.combo.type]} · {players[table.playedBy]?.name}
            </div>
          </div>
        ):(
          <div style={{color:'rgba(255,255,255,.12)',fontSize:13,fontStyle:'italic',padding:'14px 0'}}>
            {isMyTurn?'Твой ход — ходи что хочешь':'Ожидаем хода...'}
          </div>
        )}
      </div>

      {/* Log */}
      <div style={{width:'100%',borderRadius:8,padding:'6px 12px',
        background:'rgba(0,0,0,.22)',border:'1px solid rgba(255,255,255,.04)',
        fontSize:11,maxHeight:58,overflowY:'auto',display:'flex',flexDirection:'column-reverse',gap:1}}>
        {[...log].reverse().map((l,i)=>(
          <div key={i} style={{color:i===0?'rgba(240,210,130,.75)':'rgba(100,85,50,.5)'}}>{l}</div>
        ))}
      </div>

      {/* My Hand */}
      {phase==='playing'&&(
        <div style={{width:'100%',borderRadius:14,padding:'14px',
          background:'linear-gradient(175deg,rgba(0,0,0,.38),rgba(0,0,0,.22))',
          border:`1.5px solid ${isMyTurn?P_COLORS[mySeatIndex]+'44':'rgba(255,255,255,.08)'}`,
          boxShadow:isMyTurn?`0 0 40px ${P_COLORS[mySeatIndex]}0d`:'none',
          animation:'fadeIn .2s ease'}}>

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:6}}>
            <div style={{color:isMyTurn?P_COLORS[mySeatIndex]:'rgba(255,255,255,.4)',fontSize:14,fontWeight:'bold',display:'flex',alignItems:'center',gap:6}}>
              {isMyTurn&&<span>▶</span>}
              {isMyTurn?'Твой ход':'Ожидаем хода...'}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontSize:11,color:'rgba(255,255,255,.28)'}}>
                ур. <span style={{color:'#f0c040',fontWeight:'bold',fontSize:13}}>{myLV}</span>
                <span style={{marginLeft:5,color:'rgba(255,255,255,.2)'}}>{myCards.length}к</span>
              </div>
              <button onClick={()=>{setArrangeMode(m=>!m);setSelected([]);setChamVal(null);}} style={{
                padding:'4px 10px',
                background:arrangeMode?`${P_COLORS[mySeatIndex]}33`:'rgba(255,255,255,.05)',
                color:arrangeMode?P_COLORS[mySeatIndex]:'rgba(255,255,255,.3)',
                border:`1px solid ${arrangeMode?P_COLORS[mySeatIndex]:'rgba(255,255,255,.1)'}`,
                borderRadius:6,cursor:'pointer',fontSize:11,fontFamily:"'Georgia',serif"}}>
                ⠿ {arrangeMode?'Готово':'Перестановка'}
              </button>
            </div>
          </div>

          {arrangeMode&&(
            <div style={{fontSize:11,color:'rgba(96,165,250,.6)',marginBottom:8,padding:'5px 10px',
              background:'rgba(96,165,250,.06)',borderRadius:6,border:'1px solid rgba(96,165,250,.12)'}}>
              ✦ Перетаскивай карты для изменения порядка
            </div>
          )}

          <div style={{display:'flex',flexWrap:'wrap',gap:4,minHeight:100,padding:'4px 0 20px',alignItems:'flex-end'}}>
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

          {!arrangeMode&&hasChamSel&&(
            <div style={{marginBottom:12,display:'flex',alignItems:'center',flexWrap:'wrap',gap:4,
              padding:'8px 12px',background:'rgba(107,33,168,.1)',borderRadius:10,border:'1px solid rgba(155,89,182,.2)'}}>
              <span style={{fontSize:11,color:'#c39bd3',marginRight:4}}>✦ Хамелеон =</span>
              {CHAM_OK.map(v=>(
                <button key={v} onClick={()=>setChamVal(v)} style={{
                  padding:'3px 9px',background:chamVal===v?'rgba(155,89,182,.55)':'rgba(155,89,182,.1)',
                  color:chamVal===v?'#fff':'#c39bd3',border:`1px solid ${chamVal===v?'#9b59b6':'rgba(155,89,182,.22)'}`,
                  borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:"'Georgia',serif"}}>
                  {v}
                </button>
              ))}
            </div>
          )}

          {!arrangeMode&&selected.length>0&&(
            <div style={{fontSize:12,marginBottom:12,display:'flex',alignItems:'center',gap:7}}>
              <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,
                background:canPlayIt?'#52c97a':'#e05c5c',boxShadow:`0 0 10px ${canPlayIt?'#52c97a':'#e05c5c'}`}}/>
              <span style={{color:canPlayIt?'#86efac':'#fca5a5'}}>
                {curCombo?`${CLABELS[curCombo.type]}${canPlayIt?' — можно сыграть':' — не бьёт стол'}`:'Недопустимая комбинация'}
              </span>
            </div>
          )}

          {!arrangeMode&&isMyTurn&&(
            <div style={{display:'flex',gap:8,flexWrap:'wrap',animation:badAnim?'shake .35s ease':'none'}}>
              <button onClick={playCards} style={{
                padding:'11px 28px',
                background:canPlayIt?'linear-gradient(135deg,#c8920e,#f0c040)':'rgba(255,255,255,.04)',
                color:canPlayIt?'#111':'rgba(255,255,255,.15)',
                border:`1px solid ${canPlayIt?'#f0c040':'rgba(255,255,255,.07)'}`,
                borderRadius:10,cursor:canPlayIt?'pointer':'default',fontWeight:'bold',fontSize:14,
                fontFamily:"'Georgia',serif",letterSpacing:.5,
                boxShadow:canPlayIt?'0 4px 22px rgba(240,192,64,.4)':'none',transition:'all .2s'}}>
                СЫГРАТЬ
              </button>
              {canPassIt&&(
                <button onClick={pass} style={{padding:'11px 22px',background:'rgba(255,255,255,.04)',
                  color:'rgba(255,255,255,.35)',border:'1px solid rgba(255,255,255,.09)',
                  borderRadius:10,cursor:'pointer',fontSize:14,fontFamily:"'Georgia',serif"}}>
                  ПАС
                </button>
              )}
              {selected.length>0&&(
                <button onClick={()=>{setSelected([]);setChamVal(null);}} style={{
                  padding:'11px 14px',background:'transparent',color:'rgba(255,255,255,.18)',
                  border:'1px solid rgba(255,255,255,.06)',borderRadius:10,cursor:'pointer',fontSize:13}}>
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Finished */}
      {phase==='finished'&&(
        <div style={{width:'100%',borderRadius:14,padding:'24px 20px',
          background:'radial-gradient(ellipse at 50% 30%,rgba(240,192,64,.08),transparent 70%)',
          border:'1.5px solid rgba(240,192,64,.28)',textAlign:'center',animation:'fadeIn .4s ease'}}>
          <div style={{fontSize:36,marginBottom:6}}>🏆</div>
          <div style={{fontSize:18,color:'#f0c040',fontWeight:'bold',letterSpacing:3,marginBottom:16}}>ПАРТИЯ ОКОНЧЕНА</div>
          {[...players].sort((a,b)=>b.levelIdx-a.levelIdx).map((p,rank)=>(
            <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'9px 18px',margin:'5px 0',borderRadius:9,
              background:rank===0?'rgba(240,192,64,.09)':'rgba(255,255,255,.02)',
              border:`1px solid ${rank===0?'rgba(240,192,64,.28)':'rgba(255,255,255,.05)'}`}}>
              <span style={{color:P_COLORS[p.seatIndex],fontWeight:'bold',fontSize:14}}>
                {p.name}{p.isMe?' (я)':''}
              </span>
              <span style={{color:'#f0c040',fontSize:20,fontWeight:'bold'}}>{p.level}</span>
            </div>
          ))}
          {mySeatIndex===0?(
            <div style={{fontSize:12,color:'rgba(255,255,255,.35)',marginTop:16}}>
              Ты хост — нажми «Новая игра» вверху
            </div>
          ):(
            <div style={{fontSize:12,color:'rgba(255,255,255,.35)',marginTop:16}}>
              Ожидаем хоста для новой игры...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root App ──
export default function App(){
  const[screen,setScreen]=useState('lobby'); // lobby | waiting | game
  const[gs,setGs]=useState(null);
  const[roomCode,setRoomCode]=useState('');
  const[myId,setMyId]=useState('');
  const[error,setError]=useState('');
  const socketRef=useRef(null);

  useEffect(()=>{
    const socket=io(SERVER_URL,{transports:['websocket','polling']});
    socketRef.current=socket;
    setMyId(socket.id||'');
    socket.on('connect',()=>setMyId(socket.id));
    socket.on('roomCreated',({code})=>setRoomCode(code));
    socket.on('gameState',(state)=>{
      setGs(state);
      if(state.phase==='playing'||state.phase==='finished') setScreen('game');
      else if(state.players?.length>0) setScreen('waiting');
    });
    socket.on('error',(msg)=>setError(msg));
    return()=>socket.disconnect();
  },[]);

  const socket=socketRef.current;

  function handleCreate(name){
    setError('');
    socket?.emit('createRoom',{playerName:name});
    setMyId(socket?.id||'');
  }
  function handleJoin(name,code){
    setError('');
    socket?.emit('joinRoom',{playerName:name,code});
    setMyId(socket?.id||'');
  }

  if(screen==='lobby') return(
    <>
      <Lobby onCreate={handleCreate} onJoin={handleJoin}/>
      {error&&<div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',
        background:'#c0392b',color:'#fff',padding:'10px 20px',borderRadius:8,fontSize:13}}>
        {error}
      </div>}
    </>
  );
  if(screen==='waiting'&&gs) return(
    <WaitingRoom roomCode={roomCode} players={gs.players} isHost={gs.mySeatIndex===0}/>
  );
  if(screen==='game'&&gs) return(
    <Game gs={gs} socket={socket} roomCode={roomCode||gs.roomCode} myId={myId}/>
  );
  return(
    <div style={{minHeight:'100vh',background:'#0c1e0d',display:'flex',alignItems:'center',
      justifyContent:'center',color:'#f0c040',fontSize:16,fontFamily:"'Georgia',serif"}}>
      Подключение...
    </div>
  );
}
