import React, { useState, useEffect } from "react";
import { api, apiURL } from "../api";

const FORMAT_MAP={image:["png","jpg","webp","gif","bmp","tiff","pdf"],video:["mp4","webm","avi","mov","mkv"],audio:["mp3","wav","ogg","m4a"],document:["pdf","docx","xlsx","pptx"]};
const EXT_DOC=["doc","docx","rtf","odt","txt","xls","xlsx","ppt","pptx","csv","odp","ods"];
function detectCategory(file){ if(!file) return null; const mt=file.type||""; if(mt.startsWith("image/"))return"image"; if(mt.startsWith("video/"))return"video"; if(mt.startsWith("audio/"))return"audio"; const ext=(file.name.split(".").pop()||"").toLowerCase(); if(EXT_DOC.includes(ext)||ext==="pdf"||mt==="application/pdf")return"document"; return null; }

function openAuthPopup(mode,onAuth){
  const w=460,h=600,left=(screen.width-w)/2,top=(screen.height-h)/2;
  const child=window.open(`/${mode}.html`, mode, `width=${w},height=${h},left=${left},top=${top}`);
  const handler=(e)=>{ if(e.origin!==window.location.origin) return;
    if(e.data?.type==="auth" && e.data.token){ localStorage.setItem("token",e.data.token); onAuth?.(e.data.user); window.removeEventListener("message",handler); try{child?.close();}catch{} }
  };
  window.addEventListener("message",handler);
}

function AuthBar({me,setMe}) {
  function logout(){ localStorage.removeItem("token"); setMe(null); }
  return (<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    {me? (<><b>{me.email}</b><button onClick={logout}>Выйти</button></>)
        : (<><button className="btn-primary" onClick={()=>openAuthPopup("login",setMe)}>Войти</button>
             <button onClick={()=>openAuthPopup("register",setMe)}>Зарегистрироваться</button></>)}
  </div>);
}

function Converter(){
  const [file,setFile]=useState(null),[preview,setPreview]=useState(null),[category,setCategory]=useState(null);
  const [targets,setTargets]=useState([]),[target,setTarget]=useState(""),[down,setDown]=useState(null);
  useEffect(()=>{ if(!file){ setPreview(null); setCategory(null); setTargets([]); setTarget(""); return;}
    const url=URL.createObjectURL(file); setPreview(url);
    const cat=detectCategory(file); setCategory(cat); const list=cat?FORMAT_MAP[cat]:[]; setTargets(list); setTarget(list[0]||"");
    return()=>URL.revokeObjectURL(url);
  },[file]);
  async function convertNow(){ if(!file||!target) return; const fd=new FormData(); fd.append("file",file); fd.append("target",target);
    const token=localStorage.getItem("token"); const res=await fetch(apiURL+"/api/convert",{method:"POST",headers: token?{"Authorization":"Bearer "+token}:{}, body:fd});
    const j=await res.json(); if(!res.ok) throw new Error(j.error||"error"); setDown(j.download);
  }
  return (<div className="card">
    <h3 style={{marginTop:0}}>Конвертация</h3>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}
             accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt,.txt,.csv"/>
      <select value={target} onChange={e=>setTarget(e.target.value)} disabled={!targets.length}>
        {!targets.length && <option>Сначала выберите файл</option>}
        {targets.map(f=><option key={f} value={f}>{f}</option>)}
      </select>
      <button className="btn-primary" onClick={convertNow} disabled={!file||!target}>Конвертировать</button>
    </div>
    {category && (<div className="chips"><span className="muted">Доступные форматы:</span>{targets.map(t=><span key={t} className="chip">{t}</span>)}</div>)}
    {preview && (<div style={{marginTop:14}} className="preview"><b>Предпросмотр:</b><div style={{marginTop:8}}>
      {file && file.type.startsWith("image/") ? <img src={preview} alt="preview"/> : <i className="muted">Предпросмотр доступен для изображений</i>}
    </div></div>)}
    {down && <div style={{marginTop:14}}><a href={down}>Скачать результат</a></div>}
  </div>);
}

function Profile({me}){ async function downloadLast(){ const blob=await fetch(apiURL+"/api/last-file",{headers:{Authorization:"Bearer "+localStorage.getItem("token")}}).then(r=>r.blob());
  const u=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=u; a.download="last-file"; a.click(); URL.revokeObjectURL(u);}
  if(!me) return <div className="card">Авторизуйтесь, чтобы просмотреть профиль.</div>;
  return (<div className="card"><h3 style={{marginTop:0}}>Профиль</h3><p><b>Почта:</b> {me.email}</p><button onClick={downloadLast}>Скачать последний файл</button></div>);
}

function News({me}){ const [list,setList]=useState([]),[title,setTitle]=useState(""),[body,setBody]=useState("");
  useEffect(()=>{ api("/api/news").then(setList); },[]);
  async function suggest(){ await api("/api/news/suggest",{method:"POST",body:JSON.stringify({title,body})}); setTitle(""); setBody(""); alert("Отправлено на модерацию"); }
  return (<div className="card"><h3 style={{marginTop:0}}>Весёлые новости</h3>
    <div className="grid">{list.map(n=>(<div key={n.id} className="card" style={{padding:10}}><b>{n.title}</b><div className="muted">{n.body}</div></div>))}</div>
    {me && (<div style={{marginTop:12}} className="grid"><h4 style={{margin:"4px 0"}}>Предложить новость</h4>
      <input placeholder="Заголовок" value={title} onChange={e=>setTitle(e.target.value)}/>
      <textarea placeholder="Текст" value={body} onChange={e=>setBody(e.target.value)} rows={4}/>
      <div><button onClick={suggest} className="btn-primary">Отправить</button></div></div>)}
  </div>);
}

function Support({me}){ const [q,setQ]=useState(""),[items,setItems]=useState([]);
  useEffect(()=>{ if(me) api("/api/support/my").then(setItems); },[me]);
  async function ask(){ await api("/api/support/ask",{method:"POST",body:JSON.stringify({question:q})}); setQ(""); const x=await api("/api/support/my"); setItems(x); }
  return (<div className="card"><h3 style={{marginTop:0}}>Техподдержка</h3>
    {me? (<><div className="grid"><textarea placeholder="Ваш вопрос..." value={q} onChange={e=>setQ(e.target.value)} rows={3}/>
      <div><button onClick={ask} className="btn-primary">Отправить</button></div></div>
      <div style={{marginTop:10}} className="grid">{items.map(t=>(<div key={t.id} className="card" style={{padding:10}}>
        <div><b>Вопрос:</b> {t.question}</div><div><b>Ответ:</b> {t.answer || <i className="muted">пока нет</i>}</div>
        <div className="muted"><small>Статус: {t.status}</small></div></div>))}</div></>) : "Авторизуйтесь, чтобы задать вопрос."}
  </div>);
}

function Admin(){ const [users,setUsers]=useState([]),[pending,setPending]=useState([]);
  async function load(){ try{setUsers(await api("/api/admin/users"))}catch{} try{setPending(await api("/api/news/pending"))}catch{} }
  useEffect(()=>{ load(); },[]);
  return (<div className="grid">
    <div className="card"><h3 style={{marginTop:0}}>Пользователи</h3>{users.map(u=>(
      <div key={u.id} style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px dashed rgba(148,163,184,.2)"}}>
        <span>#{u.id} {u.email} <span className="muted">[{u.role}]</span></span>
        <button onClick={async()=>{await api("/api/admin/users/"+u.id,{method:"DELETE"}); await load();}}>Удалить</button>
      </div>))}</div>
    <div className="card"><h3 style={{marginTop:0}}>Новости  модерация</h3>{pending.map(n=>(
      <div key={n.id} className="card" style={{padding:10,marginBottom:8}}>
        <b>{n.title}</b><div className="muted">{n.body}</div>
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <button className="btn-primary" onClick={async()=>{await api("/api/admin/news/"+n.id+"/approve",{method:"POST"}); await load();}}>Одобрить</button>
          <button onClick={async()=>{await api("/api/admin/news/"+n.id+"/reject",{method:"POST"}); await load();}}>Отклонить</button>
        </div></div>))}</div></div>);
}

export default function App(){
  const [me,setMe]=useState(null),[tab,setTab]=useState("convert");
  useEffect(()=>{ const t=localStorage.getItem("token"); if(t) api("/api/me").then(setMe).catch(()=>{});
    const onMsg=(e)=>{ if(e.origin===window.location.origin && e.data?.type==="auth" && e.data.user){ setMe(e.data.user); } };
    window.addEventListener("message",onMsg); return()=>window.removeEventListener("message",onMsg);
  },[]);
  return (<div className="container">
    <div className="topbar"><h1 className="brand">Online Converter</h1><AuthBar me={me} setMe={setMe}/></div>
    <div className="tabs">
      <button onClick={()=>setTab("convert")} className={tab==="convert"?"btn-primary":""}>Конвертер</button>
      <button onClick={()=>setTab("profile")} className={tab==="profile"?"btn-primary":""}>Профиль</button>
      <button onClick={()=>setTab("news")} className={tab==="news"?"btn-primary":""}>Весёлые новости</button>
      <button onClick={()=>setTab("support")} className={tab==="support"?"btn-primary":""}>Техподдержка</button>
      {me?.role==="admin" && <button onClick={()=>setTab("admin")} className={tab==="admin"?"btn-primary":""}>Админ</button>}
    </div>
    {tab==="convert" && <Converter/>}
    {tab==="profile" && <Profile me={me}/>}
    {tab==="news" && <News me={me}/>}
    {tab==="support" && <Support me={me}/>}
    {tab==="admin" && <Admin/>}
  </div>);
}
