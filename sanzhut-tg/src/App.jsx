import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

// ⚠️ REPLACE THIS with your Railway server URL after deploy
const SERVER_URL = "https://sanzhut-server-production.up.railway.app";

const RED_SUITS  = new Set(['♥','♦']);
const P_COLORS   = ['#f59e0b','#3b82f6','#10b981','#d946ef'];
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
  let top,bot,typeClass = '';
  if(card.type==='joker_black'){top='🃏';bot='';typeClass='joker-black';}
  else if(card.type==='joker_red'){top='🃏';bot='';typeClass='joker-red';}
  else if(card.type==='chameleon'){top='✦';bot='';typeClass='chameleon';}
  else{
    top=card.value;
    bot=card.suit;
    typeClass = RED_SUITS.has(card.suit) ? 'red' : 'black';
  }
  
  const isLv = card.value === levelVal && card.type === 'regular' && !sm;
  const W = sm ? 44 : 64;
  const H = sm ? 64 : 92;
  
  let classes = `playing-card ${typeClass} ${sm ? 'sm' : ''}`;
  if (sel) classes += ' selected';
  if (isDragOver) classes += ' drag-over';
  if (isLv) classes += ' playable';

  return(
    <div 
      className={classes}
      onClick={onClick} 
      {...(dragHandlers||{})} 
      style={{
        width: W, height: H,
        cursor: dragHandlers ? 'grab' : onClick ? 'pointer' : 'default',
      }}
    >
      {isLv && <div style={{position:'absolute',top:4,right:4,width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 10px #10b981'}}/>}
      <div className="card-value" style={{fontSize: sm?14:top.length>1?16:22}}>{top}</div>
      {bot && <div className="card-suit" style={{fontSize: sm?12:16, opacity: 0.9}}>{bot}</div>}
    </div>
  );
}

// ── Lobby screen ──
function Lobby({onCreate,onJoin}){
  const [name,setName]=useState('');
  const [code,setCode]=useState('');
  const [mode,setMode]=useState(null);
  return(
    <div className="screen-container animate-scale-in">
      <div className="brand-title">🃏 САНЖУТ</div>
      <div style={{fontSize:12,color:'var(--gold-primary)',letterSpacing:4,marginBottom:48,opacity:0.8,fontWeight:600}}>
        ОНЛАЙН · 4 ИГРОКА
      </div>
      
      <div className="glass-panel" style={{padding: '32px', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '16px'}}>
        {!mode?(
          <>
            <button className="primary-button glass-button" onClick={()=>setMode('create')}>
              СОЗДАТЬ КОМНАТУ
            </button>
            <button className="glass-button" onClick={()=>setMode('join')}>
              ВОЙТИ В КОМНАТУ
            </button>
          </>
        ):mode==='create'?(
          <div className="animate-slide-up" style={{display:'flex',flexDirection:'column',gap:16}}>
            <input className="glass-input" value={name} onChange={e=>setName(e.target.value)}
              placeholder="Твоё имя (до 16 симв.)" maxLength={16} autoFocus />
            <button className="primary-button glass-button" disabled={!name.trim()} onClick={()=>name.trim()&&onCreate(name.trim())}>
              СОЗДАТЬ
            </button>
            <button className="glass-button" style={{background:'transparent', border:'none', opacity:0.6}} onClick={()=>setMode(null)}>
              ← Назад
            </button>
          </div>
        ):(
          <div className="animate-slide-up" style={{display:'flex',flexDirection:'column',gap:16}}>
            <input className="glass-input" value={name} onChange={e=>setName(e.target.value)}
              placeholder="Твоё имя" maxLength={16} autoFocus />
            <input className="glass-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
              placeholder="КОД КОМНАТЫ" maxLength={6} style={{letterSpacing: 4, textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--gold-primary)'}} />
            <button className="primary-button glass-button" disabled={!name.trim()||!code.trim()} onClick={()=>name.trim()&&code.trim()&&onJoin(name.trim(),code.trim())}>
              ВОЙТИ
            </button>
            <button className="glass-button" style={{background:'transparent', border:'none', opacity:0.6}} onClick={()=>setMode(null)}>
              ← Назад
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Waiting room ──
function WaitingRoom({roomCode,players,isHost}){
  return(
    <div className="screen-container animate-scale-in">
      <div className="brand-title" style={{fontSize: 28, marginBottom: 8}}>🃏 САНЖУТ</div>
      <div style={{fontSize:14,color:'var(--text-muted)',marginBottom:32}}>Ожидаем игроков...</div>
      
      <div className="glass-panel" style={{padding:'24px 32px',marginBottom:32,textAlign:'center', border: '1px solid var(--gold-glow)'}}>
        <div style={{fontSize:12,color:'var(--gold-primary)',letterSpacing:3,marginBottom:8,fontWeight:600}}>КОД КОМНАТЫ</div>
        <div style={{fontSize:42,fontWeight:900,color:'var(--gold-primary)',letterSpacing:8, textShadow: '0 0 20px var(--gold-glow)'}}>{roomCode}</div>
        <div style={{fontSize:12,color:'var(--text-muted)',marginTop:8}}>Отправь этот код друзьям</div>
      </div>
      
      <div style={{width:'100%',maxWidth:340, display: 'flex', flexDirection: 'column', gap: 8}}>
        {[0,1,2,3].map(i=>(
          <div key={i} className="glass-panel" style={{display:'flex',alignItems:'center',gap:12, padding:'14px 18px',
            background: players[i]?`linear-gradient(90deg, ${P_COLORS[i]}22, transparent)`:'var(--glass-bg)',
            borderLeft: players[i]?`4px solid ${P_COLORS[i]}`:'1px solid var(--glass-border)'}}>
            <div style={{width:10,height:10,borderRadius:'50%',
              background:players[i]?P_COLORS[i]:'var(--text-muted)',
              boxShadow: players[i]?`0 0 10px ${P_COLORS[i]}`:'none'}}/>
            <span style={{color:players[i]?'var(--text-main)':'var(--text-muted)',fontSize:16, fontWeight: players[i]?600:400}}>
              {players[i]?.name||`Ожидаем игрока ${i+1}...`}
            </span>
          </div>
        ))}
      </div>
      <div style={{marginTop:32,fontSize:13,color:'var(--text-muted)'}}>
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

  function bad(){
    setBadAnim(true);
    setTimeout(()=>setBadAnim(false),400);
  }

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
    <div className="game-container">
      <style>{`
        @keyframes shake{0%,100%{transform:none}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
      `}</style>
      {/* Header */}
      <div style={{width:'100%',display:'flex',justifyContent:'space-between',
        alignItems:'center',paddingBottom:12,borderBottom:'1px solid var(--glass-border)'}}>
        <div>
          <div className="brand-title" style={{fontSize: 22, margin: 0}}>🃏 САНЖУТ</div>
          <div style={{fontSize:10,color:'var(--gold-primary)',letterSpacing:2, opacity: 0.8, fontWeight: 600}}>ОНЛАЙН · ROOM {roomCode}</div>
        </div>
        {phase==='finished'&&mySeatIndex===0&&(
          <button className="primary-button glass-button" style={{padding: '8px 16px', fontSize: 13}} onClick={()=>socket.emit('newGame',{code:roomCode})}>
            НОВАЯ ИГРА
          </button>
        )}
      </div>

      {/* Players */}
      <div style={{display:'flex',gap:8,width:'100%'}}>
        {players.map((p,i)=>(
          <div key={i} className={`glass-panel player-spot ${currentPlayer===i&&phase==='playing'?'active':''}`} style={{
            flex:1,padding:'12px 8px',textAlign:'center',
            background:currentPlayer===i&&phase==='playing'?`linear-gradient(180deg, ${P_COLORS[i]}22, transparent)`:'var(--glass-bg)',
            borderTop: `3px solid ${currentPlayer===i&&phase==='playing'?P_COLORS[i]:finished.includes(i)?P_COLORS[i]+'55':P_COLORS[i]+'33'}`,
            opacity:finished.includes(i)?0.5:1,position:'relative'}}>
            
            <div style={{fontSize:11,color:p.isMe?'var(--gold-primary)':P_COLORS[i],fontWeight:700,letterSpacing:0.5,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', textTransform: 'uppercase'}}>
              {p.name}{p.isMe?' (я)':''} {finished.includes(i)?'✓':currentPlayer===i&&phase==='playing'?'▶':''}
            </div>
            <div style={{fontSize:26,color:'var(--text-main)',fontWeight:900,lineHeight:1, textShadow: `0 0 10px ${P_COLORS[i]}66`}}>{p.level}</div>
            <div style={{fontSize:12,color:'var(--text-muted)', marginTop: 4, fontWeight: 500}}>{p.cardCount} карт</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="game-table glass-panel" style={{width:'100%',borderRadius:20,padding:'24px 20px',
        minHeight:140,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
        <div style={{fontSize:11,color:'rgba(52, 211, 153, 0.6)',letterSpacing:4,fontWeight:700}}>СТОЛ</div>
        {table?(
          <div className="animate-scale-in" style={{display:'flex',flexWrap:'wrap',justifyContent:'center',alignItems:'center',gap:8}}>
            {table.cards.map(c=><CardFace key={c.id} card={c} levelVal={myLV}/>)}
            <div className="glass-panel" style={{marginLeft:16,padding:'8px 16px',background:'rgba(0,0,0,0.4)', borderRadius: 20, fontSize:13,color:'var(--gold-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8}}>
              <span style={{color: 'var(--text-main)'}}>{CLABELS[table.combo.type]}</span> 
              <span style={{opacity: 0.5}}>от</span>
              <span>{players[table.playedBy]?.name}</span>
            </div>
          </div>
        ):(
          <div style={{color:'rgba(255,255,255,.3)',fontSize:14,fontStyle:'italic',padding:'20px 0', fontWeight: 500}}>
            {isMyTurn?'Твой ход — выкладывай карты':'Ожидаем хода...'}
          </div>
        )}
      </div>

      {/* Log */}
      <div className="glass-panel game-logs" style={{width:'100%',padding:'8px 16px',
        background:'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)',
        fontSize:12,maxHeight:80,overflowY:'auto',display:'flex',flexDirection:'column-reverse',gap:4}}>
        {[...log].reverse().map((l,i)=>(
          <div key={i} style={{color:i===0?'var(--gold-primary)':'var(--text-muted)', fontWeight: i===0? 600: 400}}>{l}</div>
        ))}
      </div>

      {/* My Hand */}
      {phase==='playing'&&(
        <div className="glass-panel animate-slide-up" style={{width:'100%',padding:'20px',
          background: isMyTurn ? 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.4))' : 'rgba(0,0,0,0.4)',
          border: `1px solid ${isMyTurn?P_COLORS[mySeatIndex]+'66':'var(--glass-border)'}`,
          boxShadow: isMyTurn?`0 0 30px ${P_COLORS[mySeatIndex]}15, var(--glass-shadow)`:'var(--glass-shadow)'}}>

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
            <div style={{color:isMyTurn?P_COLORS[mySeatIndex]:'var(--text-muted)',fontSize:15,fontWeight:700,display:'flex',alignItems:'center',gap:8, textTransform: 'uppercase', letterSpacing: 1}}>
              {isMyTurn&&<span className="animate-pulse">▶</span>}
              {isMyTurn?'Твой ход':'Ожидание...'}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{fontSize:13,color:'var(--text-muted)', fontWeight: 500}}>
                УР. <span style={{color:'var(--gold-primary)',fontWeight:800,fontSize:16}}>{myLV}</span>
                <span style={{marginLeft:8,color:'var(--text-muted)', opacity: 0.6}}>• {myCards.length} карт</span>
              </div>
              <button className="glass-button" style={{padding:'6px 12px', fontSize: 12,
                background: arrangeMode?`${P_COLORS[mySeatIndex]}33`:'rgba(255,255,255,0.05)',
                color: arrangeMode?P_COLORS[mySeatIndex]:'var(--text-main)',
                borderColor: arrangeMode?P_COLORS[mySeatIndex]:'var(--glass-border)'
              }} onClick={()=>{setArrangeMode(m=>!m);setSelected([]);setChamVal(null);}}>
                <span style={{marginRight: 6}}>⠿</span>{arrangeMode?'Готово':'Сортировка'}
              </button>
            </div>
          </div>

          {arrangeMode&&(
            <div className="glass-panel" style={{fontSize:13,color:'#60a5fa',marginBottom:16,padding:'10px 16px',
              background:'rgba(59, 130, 246, 0.1)', border:'1px solid rgba(59, 130, 246, 0.2)', fontWeight: 500}}>
              ✦ Перетаскивай карты для изменения их порядка в руке
            </div>
          )}

          <div style={{display:'flex',flexWrap:'wrap',gap:8,minHeight:120,padding:'8px 0 24px',alignItems:'flex-end'}}>
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
            <div className="glass-panel animate-scale-in" style={{marginBottom:16,display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,
              padding:'12px 16px',background:'rgba(168, 85, 247, 0.1)', border:'1px solid rgba(168, 85, 247, 0.3)'}}>
              <span style={{fontSize:13,color:'#d8b4fe',marginRight:8, fontWeight: 600}}>✦ Хамелеон =</span>
              {CHAM_OK.map(v=>(
                <button key={v} onClick={()=>setChamVal(v)} className="glass-button" style={{
                  padding:'6px 14px', background:chamVal===v?'rgba(168, 85, 247, 0.8)':'rgba(168, 85, 247, 0.1)',
                  color:chamVal===v?'#fff':'#d8b4fe', border:`1px solid ${chamVal===v?'#d8b4fe':'rgba(168, 85, 247, 0.4)'}`,
                  fontSize:14, fontWeight: 700}}>
                  {v}
                </button>
              ))}
            </div>
          )}

          {!arrangeMode&&selected.length>0&&(
            <div className="animate-scale-in" style={{fontSize:14,marginBottom:16,display:'flex',alignItems:'center',gap:10, fontWeight: 500}}>
              <div style={{width:10,height:10,borderRadius:'50%',flexShrink:0,
                background:canPlayIt?'#10b981':'#ef4444',boxShadow:`0 0 12px ${canPlayIt?'#10b981':'#ef4444'}`}}/>
              <span style={{color:canPlayIt?'#34d399':'#f87171'}}>
                {curCombo?`${CLABELS[curCombo.type]}${canPlayIt?' — можно сыграть':' — не бьёт стол'}`:'Недопустимая комбинация'}
              </span>
            </div>
          )}

          {!arrangeMode&&isMyTurn&&(
            <div style={{display:'flex',gap:12,flexWrap:'wrap',animation:badAnim?'shake .4s ease':'none'}}>
              <button className="primary-button glass-button" disabled={!canPlayIt} onClick={playCards} style={{
                padding:'14px 32px', fontSize:15, letterSpacing: 1, 
                background: !canPlayIt ? 'rgba(255,255,255,0.05)' : undefined,
                color: !canPlayIt ? 'rgba(255,255,255,0.3)' : undefined,
                boxShadow: !canPlayIt ? 'none' : undefined, textShadow: 'none'
              }}>
                СЫГРАТЬ КАРТЫ
              </button>
              {canPassIt&&(
                <button className="glass-button" onClick={pass} style={{padding:'14px 28px', fontSize:15}}>
                  ПАС
                </button>
              )}
              {selected.length>0&&(
                <button className="glass-button" onClick={()=>{setSelected([]);setChamVal(null);}} style={{
                  padding:'14px 20px', background:'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                  СБРОСИТЬ ВЫБОР
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Finished */}
      {phase==='finished'&&(
        <div className="glass-panel animate-slide-up" style={{width:'100%',padding:'40px 24px',
          background:'radial-gradient(ellipse at center, rgba(245, 158, 11, 0.15), rgba(0,0,0,0.6))',
          border:'1px solid var(--gold-glow)',textAlign:'center'}}>
          <div style={{fontSize:54,marginBottom:12, filter: 'drop-shadow(0 0 20px rgba(245, 158, 11, 0.5))'}}>🏆</div>
          <div className="brand-title" style={{fontSize:24, letterSpacing: 4, marginBottom:32}}>ПАРТИЯ ОКОНЧЕНА</div>
          
          <div style={{display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400, margin: '0 auto'}}>
            {[...players].sort((a,b)=>b.levelIdx-a.levelIdx).map((p,rank)=>(
              <div key={p.id} className="glass-panel" style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                padding:'16px 24px', background:rank===0?'linear-gradient(90deg, rgba(245, 158, 11, 0.2), transparent)':'var(--glass-bg)',
                border:`1px solid ${rank===0?'var(--gold-glow)':'var(--glass-border)'}`}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                  <span style={{fontSize: 20, fontWeight: 900, color: rank===0?'var(--gold-primary)':'var(--text-muted)'}}>#{rank+1}</span>
                  <span style={{color:P_COLORS[p.seatIndex],fontWeight:700,fontSize:16}}>
                    {p.name}{p.isMe?' (я)':''}
                  </span>
                </div>
                <div style={{display: 'flex', alignItems: 'baseline', gap: 6}}>
                  <span style={{fontSize: 12, color:'var(--text-muted)', fontWeight: 600}}>УР.</span>
                  <span style={{color:'var(--gold-primary)',fontSize:24,fontWeight:900}}>{p.level}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div style={{fontSize:14,color:'var(--text-muted)',marginTop:32, fontWeight: 500}}>
            {mySeatIndex===0 ? 'Ты хост — нажми «Новая игра» вверху экрана' : 'Ожидаем хоста для начала новой игры...'}
          </div>
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
      {error&&<div className="glass-panel animate-slide-up" style={{position:'fixed',bottom:32,left:'50%',transform:'translateX(-50%)',
        background:'rgba(239, 68, 68, 0.9)',color:'#fff',padding:'12px 24px',fontWeight:600, border: '1px solid #fca5a5', zIndex: 100}}>
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
    <div className="screen-container">
      <div className="brand-title animate-pulse">ПОДКЛЮЧЕНИЕ К СЕРВЕРУ...</div>
    </div>
  );
}
