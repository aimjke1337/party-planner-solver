const { useMemo, useState } = React;

const ITEM_TYPES = ["beer","liquor","keg","food","snacks","decor","speakers","drugs","girls","guys","cups","trashcans","music"];
const CHARS = [{name:"Alex",avatar:"🧑‍🎤"},{name:"Blair",avatar:"🧑‍💼"},{name:"Casey",avatar:"🧑‍🍳"}];

const defaultCharacter = (x,y,t=CHARS[0]) => ({ id: crypto.randomUUID(), x,y,name:t.name,avatar:t.avatar, localNeeds:[{type:"beer",required:1},{type:"food",required:1},{type:"speakers",required:1}], globalNeed:{type:"decor",operator:"gte",required:1}});

function App(){
  const [mode,setMode] = useState("unlimited");
  const [budget,setBudget] = useState(40);
  const [seed,setSeed] = useState(1234);
  const [iterations,setIterations] = useState(5000);
  const [selectedChar,setSelectedChar] = useState(null);
  const [drag,setDrag] = useState(null);
  const [board,setBoard] = useState({characters:[],items:[]});
  const [output,setOutput] = useState("Нажмите Solve");
  const [perks,setPerks] = useState({activation:{beerNoCups:false,liquorNoCups:false,foodNoTrashcan:false},cost:{drugsCheap:false,kegsCheap:false,speakersCheap:false}});
  const [prices,setPrices] = useState({beer:2,liquor:3,keg:5,food:2,snacks:2,decor:1,speakers:3,drugs:4,girls:2,guys:2,cups:1,trashcans:1,music:1});

  const ch = useMemo(()=>board.characters.find(c=>c.id===selectedChar),[board,selectedChar]);
  const cellItem=(x,y)=>board.items.find(i=>i.x===x&&i.y===y);
  const cellChar=(x,y)=>board.characters.find(c=>c.x===x&&c.y===y);

  const onDrop=(x,y)=>{
    if(!drag) return;
    setBoard(prev=>{
      let characters=[...prev.characters], items=[...prev.items];
      if(drag.kind==="character"){
        items = items.filter(i=>!(i.x===x&&i.y===y));
        const ex=characters.find(c=>c.x===x&&c.y===y);
        if(ex){ex.name=drag.name;ex.avatar=drag.avatar;} else characters.push(defaultCharacter(x,y,drag));
      } else {
        if(characters.find(c=>c.x===x&&c.y===y)) return prev;
        items=items.filter(i=>!(i.x===x&&i.y===y));
        items.push({id:crypto.randomUUID(),x,y,type:drag.type});
      }
      return {characters,items};
    });
  };

  async function solve(){
    const res = await fetch('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,budget,seed,iterations,board,perks,prices})});
    const data = await res.json();
    setBoard(data.board);
    setOutput(JSON.stringify(data.metrics,null,2));
  }

  return <main>
    <section>
      <div className="panel"><h2>Board 6x6</h2>
      <div className="board">{Array.from({length:36}).map((_,idx)=>{const x=idx%6,y=Math.floor(idx/6);const i=cellItem(x,y),c=cellChar(x,y);const cls=`cell ${c?'character':''} ${i?'inactive':''}`;
      return <div key={idx} className={cls} onDragOver={e=>e.preventDefault()} onDrop={()=>onDrop(x,y)} onClick={()=>{if(c)setSelectedChar(c.id); if(i)setBoard(p=>({...p,items:p.items.filter(t=>t.id!==i.id)}));}}>{c?`${c.avatar} ${c.name}`:i?i.type:''}</div>})}</div>
      </div>
      <div className="panel"><h3>Controls</h3><div className="controls">
        <label>Mode<select value={mode} onChange={e=>setMode(e.target.value)}><option value="unlimited">Unlimited</option><option value="budgeted">Budgeted</option></select></label>
        <label>Budget<input type="number" value={budget} onChange={e=>setBudget(Number(e.target.value))}/></label>
        <label>Seed<input type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))}/></label>
        <label>Iterations<input type="number" value={iterations} onChange={e=>setIterations(Number(e.target.value))}/></label>
      </div><button onClick={solve}>Solve</button></div>
      <div className="panel"><h3>Output</h3><pre>{output}</pre></div>
    </section>
    <section>
      <div className="panel"><h3>Characters</h3><div className="palette">{CHARS.map(c=><div className="chip" key={c.name} draggable onDragStart={()=>setDrag({kind:'character',...c})}>{c.avatar} {c.name}</div>)}</div></div>
      <div className="panel"><h3>Items</h3><div className="palette">{ITEM_TYPES.map(t=><div className="chip" key={t} draggable onDragStart={()=>setDrag({kind:'item',type:t})}>{t}</div>)}</div></div>
      <div className="panel"><h3>Character editor</h3>{ch? <div>{ch.localNeeds.map((n,idx)=><div key={idx}><select value={n.type} onChange={e=>setBoard(p=>({...p,characters:p.characters.map(c=>c.id===ch.id?({...c,localNeeds:c.localNeeds.map((ln,i)=>i===idx?({...ln,type:e.target.value}):ln)}):c)}))}>{ITEM_TYPES.filter(t=>!['cups','trashcans','music'].includes(t)).map(t=><option key={t}>{t}</option>)}</select><input type="number" value={n.required} onChange={e=>setBoard(p=>({...p,characters:p.characters.map(c=>c.id===ch.id?({...c,localNeeds:c.localNeeds.map((ln,i)=>i===idx?({...ln,required:Number(e.target.value)}):ln)}):c)}))}/></div>)}</div> : "Выберите персонажа"}</div>
    </section>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
