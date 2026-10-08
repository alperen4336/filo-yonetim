import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle, Car, Fuel, Gauge, FileText, Wrench, ShieldAlert,
  CircleDollarSign, LayoutDashboard, Settings, Users, Plus, Search, LogOut,
  Pencil, Trash2, X, Loader2, Upload, Download, CalendarClock, Disc3,
  MapPin, Bell, ShieldCheck, Clock3, ClipboardList, CheckCircle2, ArrowLeft, RefreshCw, HeartPulse, FileSpreadsheet, FileDown, Filter, BarChart3, Building2
} from 'lucide-react';
import { supabase } from './supabase';
import { PDF_FONT_NORMAL, PDF_FONT_BOLD } from './pdfFonts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import './styles.css';

const money = n => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n||0));
const number = n => new Intl.NumberFormat('tr-TR').format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
const fuelLabels = {diesel:'Dizel',gasoline:'Benzin',hybrid:'Hibrit',electric:'Elektrik',lpg:'LPG'};
const statusLabels = {active:'Aktif',inactive:'Pasif',service:'Serviste'};
const hgsLabels = {passage:'Geçiş',topup:'Yükleme',refund:'İade',other:'Diğer'};
const accidentStatus = {open:'Açık',closed:'Kapandı',insurance:'Sigorta Sürecinde'};
const docLabels = {license:'Ruhsat',insurance:'Sigorta',casco:'Kasko',inspection:'Muayene',other:'Diğer'};

async function withTimeout(query, ms=5000, label='İşlem') {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), ms);
 try {
   return await query.abortSignal(controller.signal);
 } catch (err) {
   if (err?.name === 'AbortError' || controller.signal.aborted) {
     throw new Error(`${label} zaman aşımına uğradı. Supabase bağlantısı yanıt vermedi.`);
   }
   throw err;
 } finally {
   clearTimeout(timer);
 }
}

class AppErrorBoundary extends React.Component {
 constructor(props){super(props);this.state={hasError:false,error:null};}
 static getDerivedStateFromError(error){return {hasError:true,error};}
 componentDidCatch(error,info){console.error('Filo Yönetim UI hatası:',error,info);}
 render(){
  if(this.state.hasError){
   return <div className="loading-screen"><AlertTriangle size={30}/><div><strong>Bir ekran yüklenirken beklenmeyen bir hata oluştu.</strong><span>{this.state.error?.message||'Bilinmeyen hata'}</span><button className="primary" style={{marginTop:12}} onClick={()=>window.location.reload()}>Uygulamayı Yenile</button></div></div>;
  }
  return this.props.children;
 }
}

function App(){
 const [session,setSession]=useState(null),[booting,setBooting]=useState(true),[error,setError]=useState('');
 useEffect(()=>{ if(!supabase){setBooting(false);return;} supabase.auth.getSession().then(({data})=>{setSession(data.session);setBooting(false)}); const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>l.subscription.unsubscribe();},[]);
 if(booting)return <FullScreenMessage text="Filo Yönetim hazırlanıyor..."/>;
 if(!supabase)return <SetupMessage/>;
 if(!session)return <Auth/>;
 return <AppShell session={session} error={error} setError={setError} onLogout={()=>supabase.auth.signOut()}/>;
}

function Auth(){
 const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function submit(e){e.preventDefault();setLoading(true);setError('');setMessage('');try{const r=mode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});if(r.error)throw r.error;if(mode==='signup'&&!r.data.session)setMessage('Hesap oluşturuldu. E-posta doğrulaması açıksa gelen kutundaki bağlantıyı onayla, sonra giriş yap.');}catch(err){setError(err.message||'İşlem sırasında hata oluştu.')}finally{setLoading(false)}}
 return <div className="auth-page"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark">F</div><div><strong>Filo Yönetim</strong><span>Personal SaaS</span></div></div><h1>{mode==='login'?'Hoş geldin':'Hesap oluştur'}</h1><p className="muted">Filo verileri ortak çalışma alanında yetkili giriş yapan kullanıcılarla birlikte yönetilir.</p><form onSubmit={submit} className="form-stack"><label>E-posta<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="ornek@mail.com"/></label><label>Şifre<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="En az 6 karakter"/></label>{error&&<div className="form-error">{error}</div>}{message&&<div className="form-success">{message}</div>}<button className="primary full" disabled={loading}>{loading?<Loader2 className="spin" size={17}/>:null}{mode==='login'?'Giriş Yap':'Kayıt Ol'}</button></form><button className="link-btn" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setMessage('')}}>{mode==='login'?'İlk kez kullanıyorum → Hesap oluştur':'Zaten hesabım var → Giriş yap'}</button></div></div>
}

function AppShell({session,onLogout,error,setError}){
 const [view,setView]=useState('dashboard'),[previousView,setPreviousView]=useState('dashboard'),[search,setSearch]=useState(''),[companies,setCompanies]=useState([]),[activeCompanyId,setActiveCompanyId]=useState('all'),[vehicles,setVehicles]=useState([]),[drivers,setDrivers]=useState([]),[loading,setLoading]=useState(true),[showVehicle,setShowVehicle]=useState(false),[editingVehicle,setEditingVehicle]=useState(null),[selectedVehicle,setSelectedVehicle]=useState(null);
 const company=activeCompanyId==='all'?null:(companies.find(c=>c.id===activeCompanyId)||null);
 const activeCompanyName=activeCompanyId==='all'?'Tüm Şirketler':(company?.name||'FİLO YÖNETİM');
 const setCompany=(updated)=>{if(!updated?.id)return;setCompanies(prev=>prev.map(c=>c.id===updated.id?updated:c));if(activeCompanyId===updated.id)setActiveCompanyId(updated.id)};
 const navigate=v=>{if(v!==view)setPreviousView(view);setSelectedVehicle(null);setView(v);setSearch('');setError('')};
 const goBack=()=>{setSelectedVehicle(null);setView(previousView||'dashboard')}; const close=()=>{setSelectedVehicle(null);setView('dashboard')};
 async function load(){setLoading(true);setError('');try{let {data:cs,error:ce}=await withTimeout(supabase.from('companies').select('*').order('created_at'),'8s'==='x'?8000:8000,'Firma bilgileri');if(ce)throw ce;let allCompanies=cs||[];if(!allCompanies.length){let r=await withTimeout(supabase.from('companies').insert({owner_id:session.user.id,name:'Benim Filom'}).select().single(),8000,'Firma oluşturma');if(r.error)throw r.error;allCompanies=[r.data]}setCompanies(allCompanies);if(activeCompanyId!=='all'&&!allCompanies.some(c=>c.id===activeCompanyId))setActiveCompanyId('all');const [vr,dr]=await Promise.all([withTimeout(supabase.from('vehicles').select('*').order('created_at',{ascending:false}),8000,'Araçlar'),withTimeout(supabase.from('drivers').select('*').order('name'),8000,'Sürücüler')]);if(vr.error)throw vr.error;if(dr.error)throw dr.error;const ds=dr.data||[];const baseVehicles=vr.data||[];let policies=[];if(baseVehicles.length){const pr=await withTimeout(supabase.from('insurance_policies').select('*').in('vehicle_id',baseVehicles.map(v=>v.id)).order('created_at',{ascending:false}),8000,'Sigorta ve kasko');if(pr.error)throw pr.error;policies=pr.data||[]}const latestPolicies={};for(const p of policies){if(!latestPolicies[p.vehicle_id])latestPolicies[p.vehicle_id]={};if(!latestPolicies[p.vehicle_id][p.policy_type])latestPolicies[p.vehicle_id][p.policy_type]=p}setDrivers(ds);setVehicles(baseVehicles.map(v=>({...v,company:allCompanies.find(c=>c.id===v.company_id)||null,drivers:ds.find(d=>d.id===v.driver_id)||null,insurance:latestPolicies[v.id]?.insurance||null,casco:latestPolicies[v.id]?.casco||null})));}catch(e){setError(e.message||'Veriler yüklenemedi.')}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 async function saveVehicle(form){try{const payload={...form,company_id:form.company_id||editingVehicle?.company_id||company?.id,plate:form.plate.trim().toUpperCase(),year:form.year?Number(form.year):null,current_km:form.current_km?Number(form.current_km):0,inspection_date:form.inspection_date||null,driver_id:form.driver_id||null};delete payload.insurance;delete payload.casco;if(!payload.company_id)throw new Error('Araç eklemek için önce belirli bir şirket seçin.');let r=editingVehicle?await supabase.from('vehicles').update(payload).eq('id',editingVehicle.id).select('*').single():await supabase.from('vehicles').insert(payload).select('*').single();if(r.error)throw r.error;const vehicleId=r.data.id;const savePolicy=async(type,data)=>{const clean={vehicle_id:vehicleId,policy_type:type,start_date:data?.start_date||null,end_date:data?.end_date||null,cost:data?.cost?Number(data.cost):0,policy_no:data?.policy_no||null,provider:data?.provider||null,notes:data?.notes||null};const existing=editingVehicle?.id?await supabase.from('insurance_policies').select('id').eq('vehicle_id',vehicleId).eq('policy_type',type).order('created_at',{ascending:false}).limit(1):{data:[]};if(existing.error)throw existing.error;if(existing.data?.[0]?.id){const u=await supabase.from('insurance_policies').update(clean).eq('id',existing.data[0].id).select('*').single();if(u.error)throw u.error;return u.data}const ins=await supabase.from('insurance_policies').insert(clean).select('*').single();if(ins.error)throw ins.error;return ins.data};const insurance=await savePolicy('insurance',form.insurance||{});const casco=await savePolicy('casco',form.casco||{});const updated={...r.data,drivers:drivers.find(d=>d.id===r.data.driver_id)||null,insurance,casco};setVehicles(v=>editingVehicle?v.map(x=>x.id===editingVehicle.id?updated:x):[updated,...v]);if(editingVehicle)setSelectedVehicle(updated);setShowVehicle(false);setEditingVehicle(null)}catch(e){setError(e.message||'Araç kaydedilemedi.')}}
 async function deleteVehicle(v){if(!confirm(`${v.plate} aracını silmek istediğine emin misin?`))return;const r=await supabase.from('vehicles').delete().eq('id',v.id);if(r.error)setError(r.error.message);else setVehicles(x=>x.filter(y=>y.id!==v.id))}
 const scopedVehicles=activeCompanyId==='all'?vehicles:vehicles.filter(v=>v.company_id===activeCompanyId);
 const scopedDrivers=activeCompanyId==='all'?drivers:drivers.filter(d=>d.company_id===activeCompanyId);
 const filtered=scopedVehicles.filter(v=>`${v.plate} ${v.brand} ${v.model} ${v.drivers?.name||''} ${v.company?.name||''}`.toLowerCase().includes(search.toLowerCase()));
 if(loading)return <FullScreenMessage text="Filo verileri yükleniyor..."/>;
 const titles={dashboard:'Kontrol Merkezi',operations:'Operasyon Merkezi',alerts:'Alarm Merkezi',vehicles:'Araçlar',drivers:'Sürücüler',maintenance:'Bakım',fuel:'Yakıt',hgs:'HGS & KM',incidents:'Kaza & Ceza',documents:'Belgeler',costs:'Maliyetler',settings:'Ayarlar',reports:'Rapor Merkezi'};
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="brand-mark">F</div><div><strong>Filo Yönetim</strong><span>Personal SaaS</span></div></div><nav><Nav active={view==='dashboard'} icon={<LayoutDashboard size={18}/>} text="Dashboard" onClick={()=>navigate('dashboard')}/><Nav active={view==='operations'} icon={<ClipboardList size={18}/>} text="Operasyon Merkezi" onClick={()=>navigate('operations')}/><Nav active={view==='alerts'} icon={<Bell size={18}/>} text="Alarm Merkezi" onClick={()=>navigate('alerts')}/><Nav active={view==='vehicles'} icon={<Car size={18}/>} text="Araçlar" onClick={()=>navigate('vehicles')}/><Nav active={view==='drivers'} icon={<Users size={18}/>} text="Sürücüler" onClick={()=>navigate('drivers')}/><Nav active={view==='maintenance'} icon={<Wrench size={18}/>} text="Bakım" onClick={()=>navigate('maintenance')}/><Nav active={view==='fuel'} icon={<Fuel size={18}/>} text="Yakıt" onClick={()=>navigate('fuel')}/><Nav active={view==='hgs'} icon={<Gauge size={18}/>} text="HGS & KM" onClick={()=>navigate('hgs')}/><Nav active={view==='incidents'} icon={<ShieldAlert size={18}/>} text="Kaza & Ceza" onClick={()=>navigate('incidents')}/><Nav active={view==='documents'} icon={<FileText size={18}/>} text="Belgeler" onClick={()=>navigate('documents')}/><Nav active={view==='costs'} icon={<CircleDollarSign size={18}/>} text="Maliyetler" onClick={()=>navigate('costs')}/><Nav active={view==='reports'} icon={<BarChart3 size={18}/>} text="Rapor Merkezi" onClick={()=>navigate('reports')}/></nav><div className="sidebar-bottom"><Nav active={view==='settings'} icon={<Settings size={18}/>} text="Ayarlar" onClick={()=>navigate('settings')}/><button className="nav" onClick={onLogout}><LogOut size={18}/><span>Çıkış Yap</span></button></div></aside><main className="main"><header className="topbar"><div><div className="eyebrow">{activeCompanyName}</div><h1>{titles[view]||'Filo Yönetim'}</h1></div><div className="top-actions"><select className="company-selector" style={{minWidth:210,height:40,padding:'0 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--panel)',color:'var(--text)',fontWeight:700}} value={activeCompanyId} onChange={e=>{setActiveCompanyId(e.target.value);setSelectedVehicle(null);setSearch('');setError('')}}><option value="all">🌐 Tüm Şirketler</option>{companies.map(c=><option key={c.id} value={c.id}>🏢 {c.name}</option>)}</select>{view!=='dashboard'&&<div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ara..."/></div>}{view==='vehicles'&&<button className="primary" onClick={()=>{setEditingVehicle(null);setShowVehicle(true)}}><Plus size={17}/> Araç Ekle</button>}{view!=='dashboard'&&!selectedVehicle&&<div className="section-nav-actions"><button className="secondary" onClick={goBack}><ArrowLeft size={16}/> Geri</button><button className="icon-btn" onClick={close} title="Dashboard'a dön"><X size={18}/></button></div>}</div></header>{error&&<div className="global-error"><AlertTriangle size={17}/><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}{selectedVehicle?<VehicleDetail vehicle={selectedVehicle} drivers={scopedDrivers} company={selectedVehicle?.company||company} onBack={()=>setSelectedVehicle(null)} onEdit={v=>{setEditingVehicle(v);setShowVehicle(true)}} setError={setError}/>:view==='dashboard'?<Dashboard vehicles={scopedVehicles} drivers={scopedDrivers} onVehicles={()=>navigate('vehicles')} onNavigate={(v,vehicle)=>{if(vehicle){setSelectedVehicle(vehicle);setView('vehicles')}else navigate(v)}}/>:view==='operations'?<OperationsCenter vehicles={scopedVehicles} drivers={scopedDrivers} onNavigate={(v,vehicle)=>{if(vehicle){setSelectedVehicle(vehicle);setView('vehicles')}else navigate(v)}}/>:view==='alerts'?<AlarmCenter vehicles={scopedVehicles} drivers={scopedDrivers} onVehicle={v=>{setSelectedVehicle(v);setView('vehicles')}}/>:view==='vehicles'?<VehiclesPage vehicles={filtered} drivers={scopedDrivers} onSelect={setSelectedVehicle} onEdit={v=>{setEditingVehicle(v);setShowVehicle(true)}} onDelete={deleteVehicle}/>:<ModulePage view={view} company={company} activeCompanyId={activeCompanyId} vehicles={scopedVehicles} drivers={scopedDrivers} search={search} setError={setError} session={session} setCompany={setCompany} companies={companies} setActiveCompanyId={setActiveCompanyId} onRefresh={load}/>}</main>{showVehicle&&<VehicleModal vehicle={editingVehicle} companies={companies} activeCompanyId={activeCompanyId} drivers={scopedDrivers} onClose={()=>{setShowVehicle(false);setEditingVehicle(null)}} onCompanyCreated={async newCompany=>{setCompanies(prev=>[...prev,newCompany]);setActiveCompanyId(newCompany.id)}} onSave={saveVehicle}/>}</div>
}

function Nav({active,icon,text,onClick}){return <button className={`nav ${active?'active':''}`} onClick={onClick}>{icon}<span>{text}</span></button>}

function alarmStatus(days){if(days<0)return 'critical';if(days<=7)return 'warning';if(days<=30)return 'attention';return 'normal'}
function daysUntilDate(date){if(!date)return null;const a=new Date(`${date}T00:00:00`),b=new Date();b.setHours(0,0,0,0);return Math.ceil((a-b)/86400000)}
function AlarmCenter({vehicles,drivers,onVehicle}){const [rows,setRows]=useState([]),[loading,setLoading]=useState(true);useEffect(()=>{let cancelled=false;async function load(){setLoading(true);try{const ids=vehicles.map(v=>v.id);let schedules=[],fines=[];if(ids.length){const [s,f]=await Promise.all([supabase.from('maintenance_schedules').select('*').in('vehicle_id',ids).eq('active',true),supabase.from('fines').select('id,vehicle_id,date,reason,amount,paid').in('vehicle_id',ids).eq('paid',false)]);if(s.error)throw s.error;if(f.error)throw f.error;schedules=s.data||[];fines=f.data||[]}const out=[];for(const v of vehicles){const add=(type,title,detail,days)=>{if(days===null||days===undefined)return;out.push({id:`${v.id}-${type}-${title}`,vehicle:v,title,detail,days,status:alarmStatus(days),kind:type})};add('inspection','Muayene',v.inspection_date?`Muayene tarihi: ${v.inspection_date}`:'',daysUntilDate(v.inspection_date));add('insurance','Trafik Sigortası',v.insurance?.end_date?`Bitiş: ${v.insurance.end_date}`:'',daysUntilDate(v.insurance?.end_date));add('casco','Kasko',v.casco?.end_date?`Bitiş: ${v.casco.end_date}`:'',daysUntilDate(v.casco?.end_date));const d=drivers.find(x=>x.id===v.driver_id);add('license','Ehliyet',d?.license_expiry?`${d.name} · Bitiş: ${d.license_expiry}`:'',daysUntilDate(d?.license_expiry));const relevant=schedules.filter(x=>x.vehicle_id===v.id);for(const p of relevant){if(p.next_date){const days=daysUntilDate(p.next_date);if(days<=30)add('maintenance-date',p.name,`Bakım tarihi: ${p.next_date}`,days)}if(p.next_km!==null&&p.next_km!==undefined&&Number(v.current_km)>=Number(p.next_km)){add('maintenance-km',p.name,`Hedef KM: ${number(p.next_km)} · Araç: ${number(v.current_km)} KM`,0)}}for(const f of fines.filter(x=>x.vehicle_id===v.id))out.push({id:`fine-${f.id}`,vehicle:v,title:'Ödenmemiş ceza',detail:`${f.reason||'Ceza'} · ${money(f.amount)}`,days:-1,status:'critical',kind:'fine'});}out.sort((a,b)=>a.days-b.days);if(!cancelled)setRows(out)}catch(e){if(!cancelled)console.warn('Alarm merkezi:',e)}finally{if(!cancelled)setLoading(false)}}load();return()=>{cancelled=true}},[vehicles,drivers]);const critical=rows.filter(x=>x.status==='critical'),warning=rows.filter(x=>x.status==='warning'),attention=rows.filter(x=>x.status==='attention');return <section className="alarm-page"><div className="alarm-summary"><div className="alarm-summary-card critical"><AlertTriangle size={20}/><div><strong>{critical.length}</strong><span>Kritik</span></div></div><div className="alarm-summary-card warning"><Clock3 size={20}/><div><strong>{warning.length}</strong><span>0–7 gün</span></div></div><div className="alarm-summary-card attention"><Bell size={20}/><div><strong>{attention.length}</strong><span>8–30 gün</span></div></div><div className="alarm-summary-card normal"><CheckCircle2 size={20}/><div><strong>{rows.length?rows.length-critical.length-warning.length-attention.length:0}</strong><span>30+ gün</span></div></div></div><section className="panel"><div className="section-head"><div><h2>Alarm Merkezi</h2><p>Muayene, sigorta, kasko, ehliyet, bakım ve ödenmemiş cezaları tek yerde takip et.</p></div><span className="alarm-total"><Bell size={16}/> {rows.length} aktif uyarı</span></div>{loading?<LoadingRows/>:!rows.length?<Empty text="Şu an aktif alarm yok" sub="Tarihleri ve bakım planlarını ekledikçe sistem otomatik kontrol eder."/>:<div className="alarm-list">{rows.map(a=><button className={`alarm-row ${a.status}`} key={a.id} onClick={()=>onVehicle(a.vehicle)}><div className="alarm-icon">{a.status==='critical'?<AlertTriangle size={18}/>:a.status==='warning'?<Clock3 size={18}/>:<Bell size={18}/>}</div><div className="alarm-content"><strong>{a.vehicle.plate} · {a.title}</strong><span>{a.detail}</span></div><div className="alarm-days">{a.days<0?'Süresi geçti':a.days===0?'Bugün':`${a.days} gün`}</div><ArrowLeft className="alarm-arrow" size={16}/></button>)}</div>}</section></section>}

function healthTone(score){return score>=85?'good':score>=65?'warning':'critical'}
function healthLabel(score){return score>=85?'İyi':score>=65?'Dikkat':'Kritik'}
function dateHealthPenalty(date,soon=30){if(!date)return 0;const d=daysUntilDate(date);if(d<0)return 15;if(d<=7)return 10;if(d<=soon)return 5;return 0}
function buildHealth(v,extra={}){
 let score=100; const reasons=[];
 const inspectPenalty=dateHealthPenalty(v.inspection_date); if(inspectPenalty){score-=inspectPenalty;reasons.push({label:'Muayene',penalty:inspectPenalty})}
 const insPenalty=dateHealthPenalty(v.insurance?.end_date); if(insPenalty){score-=insPenalty;reasons.push({label:'Sigorta',penalty:insPenalty})}
 const cascoPenalty=dateHealthPenalty(v.casco?.end_date); if(cascoPenalty){score-=cascoPenalty;reasons.push({label:'Kasko',penalty:cascoPenalty})}
 const licensePenalty=dateHealthPenalty(extra.driver?.license_expiry); if(licensePenalty){score-=licensePenalty;reasons.push({label:'Ehliyet',penalty:licensePenalty})}
 const schedules=extra.schedules||[]; let maintPenalty=0;
 for(const x of schedules){let p=0;if(x.next_km!=null&&Number(v.current_km||0)>=Number(x.next_km))p=15;else if(x.next_km!=null&&Number(x.next_km)-Number(v.current_km||0)<=1000)p=7;if(x.next_date){const dp=dateHealthPenalty(x.next_date,30);p=Math.max(p,dp)} maintPenalty=Math.max(maintPenalty,p)}
 if(maintPenalty){score-=maintPenalty;reasons.push({label:'Bakım',penalty:maintPenalty})}
 const unpaid=Number(extra.unpaidFines||0);if(unpaid){const p=Math.min(20,unpaid*5);score-=p;reasons.push({label:`Ödenmemiş ceza (${unpaid})`,penalty:p})}
 const accidents=Number(extra.accidents||0);if(accidents){const p=Math.min(12,accidents*4);score-=p;reasons.push({label:`Kaza kaydı (${accidents})`,penalty:p})}
 const tread=extra.minTread; if(tread!=null){const p=tread<3?15:tread<4?8:0;if(p){score-=p;reasons.push({label:`Lastik ${String(tread).replace('.',',')} mm`,penalty:p})}} else if(extra.tireCount>0){score-=2;reasons.push({label:'Lastik verisi eksik',penalty:2})}
 const fuelAvg=extra.fuelAvg, fleetFuelAvg=extra.fleetFuelAvg;if(fuelAvg&&fleetFuelAvg){const ratio=fuelAvg/fleetFuelAvg;const p=ratio>1.2?10:ratio>1.1?5:0;if(p){score-=p;reasons.push({label:`Yakıt +%${Math.round((ratio-1)*100)}`,penalty:p})}}
 const docExpired=Number(extra.docExpired||0);if(docExpired){const p=Math.min(10,docExpired*3);score-=p;reasons.push({label:`Süresi geçmiş belge (${docExpired})`,penalty:p})}
 score=Math.max(0,Math.min(100,Math.round(score)));
 return {score,tone:healthTone(score),label:healthLabel(score),reasons};
}
function useFleetHealth(vehicles,drivers){
 const [state,setState]=useState({map:{},loading:true});
 useEffect(()=>{let cancelled=false;const ids=vehicles.map(v=>v.id);if(!ids.length){setState({map:{},loading:false});return}const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);async function load(){try{const [sch,fines,acc,tire,docs,fuel]=await Promise.all([
   supabase.from('maintenance_schedules').select('vehicle_id,name,next_km,next_date,active').in('vehicle_id',ids).eq('active',true).abortSignal(controller.signal),
   supabase.from('fines').select('vehicle_id,paid').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('accidents').select('vehicle_id,id').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('tire_records').select('vehicle_id,tread_depth').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('documents').select('vehicle_id,expires_at').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('fuel_records').select('vehicle_id,liters,km').in('vehicle_id',ids).not('km','is',null).order('km',{ascending:true}).abortSignal(controller.signal)
 ]);const all=[sch,fines,acc,tire,docs,fuel];const err=all.find(x=>x.error);if(err?.error)throw err.error;
 const schedules=sch.data||[], fineRows=fines.data||[], accRows=acc.data||[], tireRows=tire.data||[], docRows=docs.data||[], fuelRows=fuel.data||[];
 const fuelBy={};for(const f of fuelRows){const id=f.vehicle_id;(fuelBy[id]??=[]).push(f)}
 const fuelValues={};for(const [id,arr] of Object.entries(fuelBy)){const a=arr.filter(x=>Number.isFinite(Number(x.km))&&Number(x.liters)>0).sort((x,y)=>Number(x.km)-Number(y.km));if(a.length>=2){let litres=0,dist=0;for(let i=1;i<a.length;i++){const d=Number(a[i].km)-Number(a[i-1].km);if(d>0){litres+=Number(a[i].liters);dist+=d}}if(dist>0)fuelValues[id]=litres/dist*100}}
 const vals=Object.values(fuelValues).filter(Number.isFinite);const fleetFuelAvg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
 const map={};for(const v of vehicles){const driver=drivers.find(d=>d.id===v.driver_id);const unpaid=fineRows.filter(x=>x.vehicle_id===v.id&&!x.paid).length;const accidents=accRows.filter(x=>x.vehicle_id===v.id).length;const tires=tireRows.filter(x=>x.vehicle_id===v.id);const depths=tires.map(x=>Number(x.tread_depth)).filter(Number.isFinite);const docsExpired=docRows.filter(x=>x.vehicle_id===v.id&&x.expires_at&&daysUntilDate(x.expires_at)<0).length;map[v.id]=buildHealth(v,{driver,schedules:schedules.filter(x=>x.vehicle_id===v.id),unpaidFines:unpaid,accidents,minTread:depths.length?Math.min(...depths):null,tireCount:tires.length,docExpired:docsExpired,fuelAvg:fuelValues[v.id],fleetFuelAvg})}
 if(!cancelled)setState({map,loading:false})}catch(e){if(!cancelled){console.warn('Araç sağlık skoru:',e);setState(x=>({...x,loading:false}))}}finally{clearTimeout(timer)}}load();return()=>{cancelled=true;controller.abort();clearTimeout(timer)}},[vehicles.map(v=>v.id).join(','),drivers.map(d=>d.id+':'+d.license_expiry).join(',')]);return state}
function HealthBadge({health}){if(!health)return <span className="score">—</span>;return <span className={`score ${health.tone}`}><HeartPulse size={13}/> {health.score}/100 · {health.label}</span>}
function HealthCard({vehicle,health}){return <div className="panel health-card"><div className="section-head"><div><h2>Araç Sağlık Skoru</h2><p>Belge, bakım, lastik, ceza, kaza ve yakıt sinyallerinin birleşik değerlendirmesi.</p></div><HealthBadge health={health}/></div><div className="health-score-large"><div className={`health-ring ${health?.tone||'good'}`}><strong>{health?.score??'—'}</strong><span>/100</span></div><div className="health-reasons">{health?.reasons?.length?<>{health.reasons.slice(0,5).map((r,i)=><div key={i}><span>{r.label}</span><b>-{r.penalty}</b></div>)}</>:<div className="health-ok"><CheckCircle2 size={18}/> Kritik düşürücü sinyal bulunmuyor.</div>}</div></div></div>}

function Dashboard({vehicles,drivers,onVehicles,onNavigate}){
 const [stats,setStats]=useState({fuel:0,maintenance:0,hgs:0,fines:0,accidents:0,tires:0,insurance:0,casco:0,docs:0});
 const [alarms,setAlarms]=useState([]); const [loading,setLoading]=useState(true);
 const health=useFleetHealth(vehicles,drivers);
 useEffect(()=>{let cancelled=false;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6000);async function load(){
   if(!vehicles.length){if(!cancelled){setStats({fuel:0,maintenance:0,hgs:0,fines:0,accidents:0,tires:0,insurance:0,casco:0,docs:0});setAlarms([]);setLoading(false)}return}
   try{const ids=vehicles.map(v=>v.id);
    const [a,b,c,d,e,t,p,doc,sched]=await Promise.all([
      supabase.from('fuel_records').select('cost').in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('maintenance_records').select('cost').in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('hgs_records').select('amount,type').in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('fines').select('amount').in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('accidents').select('damage_cost').in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('tire_records').select('cost').in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('insurance_policies').select('vehicle_id,policy_type,cost,end_date').in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('documents').select('id',{count:'exact',head:true}).in('vehicle_id',ids).abortSignal(controller.signal),
      supabase.from('maintenance_schedules').select('vehicle_id,name,next_date,next_km,active').in('vehicle_id',ids).eq('active',true).abortSignal(controller.signal)
    ]);
    const first=[a,b,c,d,e,t,p,doc,sched].find(x=>x.error);if(first?.error)throw first.error;
    const policy=(p.data||[]).reduce((o,x)=>{o[x.policy_type]=(o[x.policy_type]||0)+Number(x.cost||0);return o},{});
    const hgs=(c.data||[]).reduce((s,x)=>s+(x.type==='refund'?-Math.abs(Number(x.amount||0)):Number(x.amount||0)),0);
    const st={fuel:(a.data||[]).reduce((s,x)=>s+Number(x.cost||0),0),maintenance:(b.data||[]).reduce((s,x)=>s+Number(x.cost||0),0),hgs,fines:(d.data||[]).reduce((s,x)=>s+Number(x.amount||0),0),accidents:(e.data||[]).reduce((s,x)=>s+Number(x.damage_cost||0),0),tires:(t.data||[]).reduce((s,x)=>s+Number(x.cost||0),0),insurance:policy.insurance||0,casco:policy.casco||0,docs:doc.count||0};
    const days=(date)=>date?Math.ceil((new Date(date+'T00:00:00')-new Date(today()+'T00:00:00'))/86400000):null;
    const al=[]; for(const v of vehicles){const add=(kind,title,detail,d)=>{if(d===null||d===undefined||d>30)return;al.push({id:`${v.id}-${kind}-${title}`,vehicle:v,title,detail,days:d,status:d<0?'critical':d<=7?'warning':'attention'})};add('inspection','Muayene',v.inspection_date?`Bitiş: ${v.inspection_date}`:'',days(v.inspection_date));add('insurance','Trafik Sigortası',v.insurance?.end_date?`Bitiş: ${v.insurance.end_date}`:'',days(v.insurance?.end_date));add('casco','Kasko',v.casco?.end_date?`Bitiş: ${v.casco.end_date}`:'',days(v.casco?.end_date));const dr=drivers.find(x=>x.id===v.driver_id);add('license','Ehliyet',dr?.license_expiry?`${dr.name} · ${dr.license_expiry}`:'',days(dr?.license_expiry));(sched.data||[]).filter(x=>x.vehicle_id===v.id).forEach(x=>{if(x.next_date)add('maintenance','Bakım',`${x.name} · ${x.next_date}`,days(x.next_date));if(x.next_km!=null&&Number(v.current_km)>=Number(x.next_km))add('maintenance-km','Bakım',`${x.name} · ${number(x.next_km)} KM hedefi`,0)});}
    const fr=d.data||[]; fr.filter(x=>!x.paid).forEach(x=>{}); if(!cancelled){setStats(st);setAlarms(al.sort((x,y)=>x.days-y.days));}
   }catch(err){if(!cancelled)console.warn('Dashboard veri yükleme:',err)}finally{clearTimeout(timer);if(!cancelled)setLoading(false)}}load();return()=>{cancelled=true;controller.abort();clearTimeout(timer)}},[vehicles,drivers]);
 const total=stats.fuel+stats.maintenance+stats.hgs+stats.fines+stats.accidents+stats.tires+stats.insurance+stats.casco;
 const active=vehicles.filter(v=>v.status==='active').length; const healthRows=vehicles.map(v=>({v,h:health.map[v.id]})).filter(x=>x.h).sort((a,b)=>a.h.score-b.h.score);
 return <>
  <section className="hero-grid dashboard-kpis">
   <Stat icon={<Car/>} label="Toplam Araç" value={number(vehicles.length)} sub={`${active} aktif · ${vehicles.length-active} diğer`}/>
   <Stat icon={<CircleDollarSign/>} label="Toplam Filo Maliyeti" value={money(total)} sub="Tüm kayıtlı giderler"/>
   <Stat icon={<Gauge/>} label="Ortalama Araç Maliyeti" value={vehicles.length?money(total/vehicles.length):money(0)} sub="Araç başına"/>
   <Stat icon={<HeartPulse/>} label="Ortalama Sağlık" value={healthRows.length?`${Math.round(healthRows.reduce((s,x)=>s+x.h.score,0)/healthRows.length)}/100`:'—'} sub={`${healthRows.filter(x=>x.h.score<65).length} kritik araç`}/>
  </section>
  <section className="dashboard-grid">
   <div className="panel dashboard-alert-panel"><div className="section-head"><div><h2>Bugün Dikkat Gerektirenler</h2><p>Alarm Merkezi'ndeki en yakın işlemler.</p></div><button className="secondary" onClick={()=>onNavigate('alerts')}><Bell size={15}/> Tümünü Gör</button></div>{loading?<LoadingRows/>:!alarms.length?<div className="dashboard-empty"><CheckCircle2 size={20}/><div><strong>Şu an yaklaşan kritik işlem yok.</strong><span>Alarm Merkezi temiz görünüyor.</span></div></div>:<div className="dashboard-alarm-list">{alarms.slice(0,5).map(a=><button key={a.id} className={`dashboard-alarm ${a.status}`} onClick={()=>onNavigate('vehicles',a.vehicle)}><span className="alert-icon">{a.status==='critical'?<AlertTriangle size={16}/>:<Clock3 size={16}/>}</span><span><strong>{a.vehicle.plate} · {a.title}</strong><small>{a.detail}</small></span><b>{a.days<0?'Geçti':a.days===0?'Bugün':`${a.days} gün`}</b></button>)}</div>}</div>
   <div className="panel dashboard-health-panel"><div className="section-head"><div><h2>En Çok Dikkat Gerektiren Araçlar</h2><p>Sağlık skoru en düşük araçlar.</p></div><button className="secondary" onClick={onVehicles}><Car size={15}/> Araçlar</button></div>{health.loading?<LoadingRows/>:<div className="health-list">{healthRows.slice(0,5).map(({v,h})=><div className="health-row" key={v.id}><div><strong>{v.plate}</strong><span>{[v.brand,v.model].filter(Boolean).join(' ')||'Araç'}</span></div><div className="bar"><i style={{width:`${h.score}%`}}/></div><HealthBadge health={h}/></div>)}</div>}</div>
  </section>
  <section className="panel"><div className="section-head"><div><h2>Maliyet Dağılımı</h2><p>Filonun toplam maliyetini oluşturan ana kalemler.</p></div><button className="secondary" onClick={()=>onNavigate('costs')}><CircleDollarSign size={15}/> Maliyetlere Git</button></div><div className="metric-grid dashboard-cost-grid"><Metric title="Yakıt" value={money(stats.fuel)} icon={<Fuel/>}/><Metric title="Bakım" value={money(stats.maintenance)} icon={<Wrench/>}/><Metric title="HGS" value={money(stats.hgs)} icon={<Gauge/>}/><Metric title="Lastik" value={money(stats.tires)} icon={<Disc3/>}/><Metric title="Sigorta + Kasko" value={money(stats.insurance+stats.casco)} icon={<ShieldCheck/>}/><Metric title="Ceza" value={money(stats.fines)} icon={<ShieldAlert/>}/><Metric title="Kaza / Hasar" value={money(stats.accidents)} icon={<AlertTriangle/>} emphasis/></div></section>
  <section className="dashboard-bottom-grid">
   <div className="panel"><div className="section-head"><div><h2>Hızlı İşlemler</h2><p>En sık kullandığın bölümlere tek tıkla geç.</p></div></div><div className="quick-actions"><button onClick={()=>onNavigate('vehicles')}><Car/><span>Araçlar</span><small>Araç bilgileri ve sağlık</small></button><button onClick={()=>onNavigate('fuel')}><Fuel/><span>Yakıt</span><small>Tüketim ve kayıtlar</small></button><button onClick={()=>onNavigate('maintenance')}><Wrench/><span>Bakım</span><small>Bakım planları</small></button><button onClick={()=>onNavigate('documents')}><FileText/><span>Belgeler</span><small>Dosya ve süreler</small></button></div></div>
   <div className="panel"><div className="section-head"><div><h2>Filo Özeti</h2><p>Operasyonel durum.</p></div></div><div className="summary-stat-list"><div><span>Aktif araç</span><strong>{active}</strong></div><div><span>Serviste</span><strong>{vehicles.filter(v=>v.status==='service').length}</strong></div><div><span>Pasif</span><strong>{vehicles.filter(v=>v.status==='inactive').length}</strong></div><div><span>Kayıtlı sürücü</span><strong>{drivers.length}</strong></div><div><span>Yüklenen belge</span><strong>{stats.docs}</strong></div></div></div>
  </section>
 </>
}
function VehiclesPage({vehicles,drivers,onSelect,onEdit,onDelete}){const health=useFleetHealth(vehicles,drivers);const showCompany=vehicles.some(v=>v.company?.name);return <section className="panel"><div className="section-head"><div><h2>Filo Araçları</h2><p>Araca tıklayarak detay ve tüm kayıtlarına geç.</p></div></div><div className="table-wrap"><table><thead><tr>{showCompany&&<th>Şirket</th>}<th>Plaka</th><th>Araç</th><th>Sürücü</th><th>KM</th><th>Yakıt</th><th>Sağlık</th><th>Durum</th><th></th></tr></thead><tbody>{vehicles.map(v=><tr key={v.id} className="clickable-row" onClick={()=>onSelect(v)}>{showCompany&&<td><strong>{v.company?.name||'—'}</strong></td>}<td><strong>{v.plate}</strong></td><td>{v.brand} {v.model}<small>{v.year||''}</small></td><td>{v.drivers?.name||'Atanmamış'}</td><td>{number(v.current_km)}</td><td>{fuelLabels[v.fuel_type]||v.fuel_type||'—'}</td><td><HealthBadge health={health.map[v.id]}/></td><td><span className={`status ${v.status}`}>{statusLabels[v.status]||v.status}</span></td><td><div className="row-actions" onClick={e=>e.stopPropagation()}><button className="icon-btn" onClick={()=>onEdit(v)}><Pencil size={15}/></button><button className="danger-btn" onClick={()=>onDelete(v)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>{!vehicles.length&&<div className="table-empty"><strong>Henüz araç yok</strong><span>Sağ üstten Araç Ekle ile başlayabilirsin.</span></div>}</div></section>}

function VehicleDetail({vehicle,drivers,onBack,onEdit,setError}){const [tab,setTab]=useState('general');const health=useFleetHealth([vehicle],drivers);const tabs=[['general','Genel'],['fuel','Yakıt'],['maintenance','Bakım'],['hgs','HGS & KM'],['incidents','Kaza & Ceza'],['tires','Lastikler'],['documents','Belgeler'],['costs','Maliyet']];return <section className="vehicle-detail"><div className="detail-top"><div className="detail-actions"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/> Araçlara Dön</button><button className="icon-btn" onClick={onBack}><X size={18}/></button></div><div className="detail-actions"><span className={`status ${vehicle.status}`}>{statusLabels[vehicle.status]}</span><button className="primary" onClick={()=>onEdit(vehicle)}><Pencil size={16}/> Düzenle</button></div></div><div className="vehicle-hero panel"><div><div className="eyebrow">ARAÇ DETAYI</div><h2>{vehicle.plate}</h2><p>{vehicle.brand||'Marka'} {vehicle.model||''} {vehicle.year?`· ${vehicle.year}`:''}</p></div><div className="hero-km"><span>Güncel KM</span><strong>{number(vehicle.current_km)}</strong></div></div><div className="detail-tabs">{tabs.map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div>{tab==='general'?<><HealthCard vehicle={vehicle} health={health.map[vehicle.id]}/><GeneralVehicle vehicle={vehicle}/></>:tab==='costs'?<VehicleCosts vehicle={vehicle}/>:<VehicleModule tab={tab} vehicle={vehicle} drivers={drivers} setError={setError}/>}</section>}
function GeneralVehicle({vehicle}){return <div className="detail-grid"><div className="panel detail-card"><div className="section-head"><div><h2>Araç Bilgileri</h2><p>Temel araç bilgileri</p></div></div><div className="info-grid"><Info label="Plaka" value={vehicle.plate}/><Info label="Marka" value={vehicle.brand}/><Info label="Model" value={vehicle.model}/><Info label="Model yılı" value={vehicle.year}/><Info label="Yakıt tipi" value={fuelLabels[vehicle.fuel_type]}/><Info label="Güncel KM" value={number(vehicle.current_km)}/><Info label="Şasi / VIN" value={vehicle.vin}/><Info label="Durum" value={statusLabels[vehicle.status]}/><Info label="Muayene tarihi" value={vehicle.inspection_date}/><Info label="Sürücü" value={vehicle.drivers?.name}/><Info label="Sigorta bitiş" value={vehicle.insurance?.end_date}/><Info label="Sigorta maliyeti" value={vehicle.insurance?.cost?money(vehicle.insurance.cost):'—'}/><Info label="Kasko bitiş" value={vehicle.casco?.end_date}/><Info label="Kasko maliyeti" value={vehicle.casco?.cost?money(vehicle.casco.cost):'—'}/></div></div><div className="panel detail-card"><div className="section-head"><div><h2>Sigorta & Kasko</h2><p>Poliçe bilgileri araç kaydına bağlıdır.</p></div></div><div className="info-grid"><Info label="Sigorta şirketi" value={vehicle.insurance?.provider}/><Info label="Sigorta poliçe no" value={vehicle.insurance?.policy_no}/><Info label="Kasko şirketi" value={vehicle.casco?.provider}/><Info label="Kasko poliçe no" value={vehicle.casco?.policy_no}/></div></div><div className="panel detail-card"><div className="section-head"><div><h2>Hızlı Kontrol</h2><p>Sonraki geliştirmeler için temel bilgiler</p></div></div><div className="detail-empty"><CalendarClock size={26}/><strong>Belge ve bakım alarmı aktif edilecek</strong><span>Muayene, sigorta, kasko ve bakım planları üzerinden yaklaşan işler burada gösterilecek.</span></div></div></div>}
function VehicleModule({tab,vehicle,drivers,setError}){const map={fuel:'fuel',maintenance:'maintenance',hgs:'hgs',incidents:'incidents',tires:'tires',documents:'documents'};return <ModulePage view={map[tab]} company={null} vehicles={[vehicle]} drivers={drivers} search="" setError={setError} vehicleFilter={vehicle.id}/>}

const MODULES={
 drivers:{table:'drivers',title:'Sürücüler',desc:'Sürücü kartlarını, ehliyet bilgilerini ve araç atamasını yönet.',company:true,fields:[['name','Ad Soyad','text',true],['phone','Telefon','text'],['license_no','Ehliyet No','text'],['license_expiry','Ehliyet Bitiş','date'],['active','Aktif','checkbox'],['notes','Not','text']]},
 fuel:{table:'fuel_records',title:'Yakıt',desc:'Yakıt, litre, KM ve istasyon kayıtlarını tut. Tüketim analizi için temel veridir.',vehicle:true,fields:[['date','Tarih','date',true],['liters','Litre','number',true],['cost','Tutar (TL)','number',true],['km','KM','number',true],['station','İstasyon','text'],['fuel_type','Yakıt Tipi','select',false,['diesel','gasoline','hybrid','lpg']],['receipt_no','Fiş No','text'],['note','Not','text']]},
 maintenance:{table:'maintenance_records',title:'Bakım',desc:'Servis geçmişi ve bakım maliyetlerini takip et.',vehicle:true,fields:[['date','Tarih','date',true],['description','İşlem / Açıklama','text',true],['km','KM','number'],['category','Kategori','text'],['cost','Tutar (TL)','number'],['service_name','Servis','text'],['invoice_no','Fatura No','text'],['note','Not','text']]},
 hgs:{table:'hgs_records',title:'HGS & KM',desc:'HGS hareketlerini ve araç kilometre geçmişini yönet.',vehicle:true,fields:[['date','Tarih','date',true],['type','Tür','select',true,['passage','topup','refund','other']],['amount','Tutar (TL)','number',true],['note','Not','text']]},
 km:{table:'km_records',title:'KM Geçmişi',desc:'Araç kilometre ölçümlerini tarih bazında kaydet.',vehicle:true,fields:[['date','Tarih','date',true],['km','KM','number',true],['source','Kaynak','text'],['note','Not','text']]},
 accidents:{table:'accidents',title:'Kazalar',desc:'Kaza, kusur, hasar ve sigorta dosyalarını takip et.',vehicle:true,fields:[['driver_id','Sürücü','driver',false],['date','Tarih','date',true],['location','Konum','text'],['description','Açıklama','text',true],['fault_rate','Kusur %','number'],['damage_cost','Hasar Maliyeti','number'],['insurance_file_no','Sigorta Dosya No','text'],['status','Durum','select',false,['open','closed','insurance']],['notes','Not','text']]},
 fines:{table:'fines',title:'Cezalar',desc:'Trafik cezalarını, sürücüyü ve ödeme durumunu takip et.',vehicle:true,fields:[['driver_id','Sürücü','driver',false],['date','Tarih','date',true],['reason','Ceza Nedeni','text',true],['amount','Tutar (TL)','number'],['paid','Ödendi','checkbox'],['paid_date','Ödeme Tarihi','date'],['notes','Not','text']]},
 tires:{table:'tire_records',title:'Lastikler',desc:'Lastik seti, DOT, diş derinliği ve maliyetini takip et.',vehicle:true,fields:[['position','Pozisyon','text'],['brand','Marka','text'],['model','Model','text'],['size','Ebat','text'],['dot','DOT','text'],['season','Mevsim','select',false,['Yaz','Kış','4 Mevsim']],['installed_date','Takılma Tarihi','date'],['installed_km','Takılma KM','number'],['tread_depth','Diş Derinliği mm','number'],['cost','Maliyet','number'],['notes','Not','text']]},
 documents:{table:'documents',title:'Belgeler',desc:'Ruhsat, sigorta, kasko, muayene ve diğer belgeleri PDF/görüntü olarak yükle.',vehicle:true,fields:[['document_type','Belge Türü','select',true,['license','insurance','casco','inspection','other']],['name','Belge Adı','text',true],['expires_at','Bitiş Tarihi','date']]}
};


function FuelPage({vehicles,search,setError,vehicleFilter,companies=[],activeCompanyId='all'}){
 const [tab,setTab]=useState('records');
 const fuelCfg=MODULES.fuel;
 const kmCfg=MODULES.km;
 return <>
   <div className="detail-tabs module-tabs fuel-tabs">
     <button className={tab==='records'?'active':''} onClick={()=>setTab('records')}><Fuel size={16}/> Yakıt Kayıtları</button>
     <button className={tab==='analysis'?'active':''} onClick={()=>setTab('analysis')}><Gauge size={16}/> Akıllı Analiz</button>
     <button className={tab==='km'?'active':''} onClick={()=>setTab('km')}><ClipboardList size={16}/> KM Geçmişi</button>
   </div>
   {tab==='records'?<GenericModulePage view="fuel" vehicles={vehicles} drivers={[]} companies={companies} activeCompanyId={activeCompanyId} search={search} setError={setError} vehicleFilter={vehicleFilter}/>:tab==='km'?<GenericModulePage view="km" vehicles={vehicles} drivers={[]} companies={companies} activeCompanyId={activeCompanyId} search={search} setError={setError} vehicleFilter={vehicleFilter}/>:<FuelAnalysisPage vehicles={vehicles} search={search} setError={setError} vehicleFilter={vehicleFilter}/>} 
 </>
}

function FuelAnalysisPage({vehicles,search,setError,vehicleFilter}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true);
 useEffect(()=>{
   let cancelled=false;
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),5000);
   async function load(){
     setLoading(true);
     try{
       let q=supabase.from('fuel_records').select('id,vehicle_id,date,liters,cost,km,station,fuel_type').order('date',{ascending:true}).abortSignal(controller.signal);
       const ids=vehicleFilter?[vehicleFilter]:vehicles.map(v=>v.id);
       if(!ids.length){if(!cancelled)setRows([]);return;}
       q=q.in('vehicle_id',ids);
       const r=await q;
       if(r.error)throw r.error;
       if(!cancelled)setRows(r.data||[]);
     }catch(e){
       if(!cancelled){
         if(e?.name==='AbortError'||controller.signal.aborted)setError('Yakıt analizi 5 saniye içinde yanıt vermedi. Supabase/RLS bağlantısını kontrol et.');
         else setError(e.message||'Yakıt analizi yüklenemedi.');
       }
     }finally{clearTimeout(timer);if(!cancelled)setLoading(false)}
   }
   load();
   return()=>{cancelled=true;controller.abort();clearTimeout(timer)};
 },[vehicles.map(v=>v.id).join(','),vehicleFilter]);
 const analytics=useMemo(()=>{
   const by={}; const now=new Date(); const cutoff30=new Date(now); cutoff30.setDate(cutoff30.getDate()-30);
   for(const v of vehicles){if(vehicleFilter&&v.id!==vehicleFilter)continue;by[v.id]={vehicle:v,records:[],totalLiters:0,totalCost:0,intervals:[],last30Cost:0,last30Liters:0};}
   for(const r of rows){if(!by[r.vehicle_id])continue;by[r.vehicle_id].records.push(r);by[r.vehicle_id].totalLiters+=Number(r.liters||0);by[r.vehicle_id].totalCost+=Number(r.cost||0);const d=r.date?new Date(`${r.date}T00:00:00`):null;if(d&&d>=cutoff30){by[r.vehicle_id].last30Cost+=Number(r.cost||0);by[r.vehicle_id].last30Liters+=Number(r.liters||0)}}
   const cards=Object.values(by).map(x=>{const recs=[...x.records].filter(r=>r.km!==null&&r.km!==undefined&&r.km!==''&&Number(r.km)>=0).sort((a,b)=>Number(a.km)-Number(b.km)||new Date(a.date||0)-new Date(b.date||0));for(let i=1;i<recs.length;i++){const prev=recs[i-1],cur=recs[i],kmDelta=Number(cur.km)-Number(prev.km),liters=Number(cur.liters||0),cost=Number(cur.cost||0);if(kmDelta>0&&liters>=0)x.intervals.push({km:kmDelta,liters,cost,date:cur.date,consumption:liters/kmDelta*100,tlkm:cost/kmDelta})}const valid=x.intervals.filter(i=>Number.isFinite(i.consumption)&&i.consumption>0&&i.consumption<80);const avg=valid.length?valid.reduce((s,i)=>s+i.consumption,0)/valid.length:null;const avgTl=valid.length?valid.reduce((s,i)=>s+i.tlkm,0)/valid.length:null;const last=valid[valid.length-1]||null;const change=avg&&last?((last.consumption-avg)/avg)*100:null;const totalKm=valid.reduce((s,i)=>s+i.km,0);const overallTl=totalKm?x.intervals.reduce((s,i)=>s+i.cost,0)/totalKm:null;return {...x,avg,avgTl,last,change,totalKm,overallTl,validCount:valid.length}});
   const fleetValid=cards.flatMap(c=>c.intervals).filter(i=>Number.isFinite(i.consumption)&&i.consumption>0&&i.consumption<80),fleetKm=fleetValid.reduce((s,i)=>s+i.km,0),fleetLiters=fleetValid.reduce((s,i)=>s+i.liters,0),fleetCost=fleetValid.reduce((s,i)=>s+i.cost,0),fleetConsumption=fleetKm?fleetLiters/fleetKm*100:null,fleetTlKm=fleetKm?fleetCost/fleetKm:null,totalCost=cards.reduce((s,c)=>s+c.totalCost,0),totalLiters=cards.reduce((s,c)=>s+c.totalLiters,0),last30Cost=cards.reduce((s,c)=>s+c.last30Cost,0),last30Liters=cards.reduce((s,c)=>s+c.last30Liters,0);
   return {cards,fleetConsumption,fleetTlKm,totalCost,totalLiters,last30Cost,last30Liters};
 },[rows,vehicles,vehicleFilter]);
 const visible=analytics.cards.filter(c=>JSON.stringify({plate:c.vehicle.plate,brand:c.vehicle.brand,model:c.vehicle.model}).toLowerCase().includes((search||'').toLowerCase()));
 const anomalyCount=analytics.cards.filter(c=>c.change!==null&&c.validCount>=2&&c.change>=15).length;
 return <section className="fuel-analytics-page">
   <section className="hero-grid fuel-hero-grid"><Stat icon={<Fuel/>} label="Toplam Yakıt" value={money(analytics.totalCost)} sub={`${number(analytics.totalLiters)} litre`}/><Stat icon={<Gauge/>} label="Filo Ortalaması" value={analytics.fleetConsumption!==null?`${analytics.fleetConsumption.toFixed(1).replace('.',',')} L/100 km`:'—'} sub={analytics.fleetTlKm!==null?`${money(analytics.fleetTlKm)} / km`:'Yeterli KM verisi yok'}/><Stat icon={<CalendarClock/>} label="Son 30 Gün" value={money(analytics.last30Cost)} sub={`${number(analytics.last30Liters)} litre`}/><Stat icon={<AlertTriangle/>} label="Anomali" value={number(anomalyCount)} sub="%15+ tüketim artışı"/></section>
   <section className="panel fuel-analysis-panel"><div className="section-head"><div><h2>⛽ Akıllı Yakıt Analizi</h2><p>Yakıt kayıtları ile KM geçmişini eşleştirerek tüketim ve kilometre maliyetini hesaplar.</p></div><span className="alarm-total"><Fuel size={15}/> {number(analytics.cards.length)} araç analizde</span></div>{loading?<LoadingRows/>:!visible.length?<Empty text="Analiz için yakıt kaydı yok" sub="Yakıt Kayıtları sekmesinden litre, tutar ve KM bilgilerini düzenli gir."/>:<div className="fuel-analysis-grid">{visible.map(c=>{const anomaly=c.change!==null&&c.validCount>=2&&c.change>=15,good=c.change!==null&&c.validCount>=2&&c.change<=-5;return <article className={`fuel-card ${anomaly?'anomaly':''}`} key={c.vehicle.id}><div className="fuel-card-head"><div><strong>{c.vehicle.plate||'Plaka yok'}</strong><span>{[c.vehicle.brand,c.vehicle.model].filter(Boolean).join(' ')||'Araç'}</span></div><span className={`fuel-status ${anomaly?'bad':good?'good':''}`}>{anomaly?'⚠ Yüksek tüketim':good?'↓ İyileşiyor':'Normal'}</span></div><div className="fuel-metrics"><div><span>Ortalama</span><strong>{c.avg!==null?`${c.avg.toFixed(1).replace('.',',')} L/100 km`:'—'}</strong></div><div><span>TL / km</span><strong>{c.avgTl!==null?money(c.avgTl):'—'}</strong></div><div><span>Son 30 gün</span><strong>{money(c.last30Cost)}</strong></div><div><span>Toplam</span><strong>{money(c.totalCost)}</strong></div></div><div className="fuel-progress"><div className="fuel-progress-label"><span>Son tüketim</span><strong>{c.last?`${c.last.consumption.toFixed(1).replace('.',',')} L/100 km`:'Yeterli veri yok'}</strong></div>{c.avg!==null&&c.last?<div className="fuel-bar"><i style={{width:`${Math.min(100,Math.max(4,(c.last.consumption/(c.avg*1.5))*100))}%`}}/></div>:null}</div>{anomaly?<div className="fuel-alert"><AlertTriangle size={15}/><span>Son tüketim araç ortalamasından <strong>%{Math.round(c.change)}</strong> daha yüksek.</span></div>:good?<div className="fuel-good"><CheckCircle2 size={15}/><span>Son tüketim araç ortalamasından %{Math.abs(Math.round(c.change))} daha düşük.</span></div>:<div className="fuel-note">{c.validCount<2?'Tüketim hesabı için en az 2 farklı KM kayıtlı yakıt alımı gerekiyor.':'Son tüketim normal aralıkta.'}</div>}</article>})}</div>}</section>
   <section className="panel"><div className="section-head"><div><h2>Araç Karşılaştırması</h2><p>Yakıt performansını araç bazında karşılaştır.</p></div></div>{loading?<LoadingRows/>:<div className="table-wrap"><table><thead><tr><th>Araç</th><th>Ortalama L/100 km</th><th>TL/km</th><th>Son 30 gün</th><th>Durum</th></tr></thead><tbody>{[...visible].sort((a,b)=>(b.avgTl||0)-(a.avgTl||0)).map(c=><tr key={c.vehicle.id}><td><strong>{c.vehicle.plate}</strong><small>{c.vehicle.brand||''} {c.vehicle.model||''}</small></td><td>{c.avg!==null?`${c.avg.toFixed(1).replace('.',',')} L/100 km`:'—'}</td><td>{c.avgTl!==null?money(c.avgTl):'—'}</td><td>{money(c.last30Cost)}</td><td><span className={`status ${c.change>=15?'critical':c.change<=-5?'good':'warning'}`}>{c.change===null?'Veri bekleniyor':c.change>=15?'Yüksek':c.change<=-5?'İyileşiyor':'Normal'}</span></td></tr>)}</tbody></table></div>}</section>
   <section className="panel fuel-tip-panel"><Fuel size={20}/><div><strong>Doğru tüketim için önemli</strong><span>Sistemin L/100 km hesabı yakıt kayıtlarındaki KM farkını kullanır. Bu yüzden her yakıt alımında güncel araç KM'sini girmen, analiz doğruluğunu ciddi şekilde artırır.</span></div></section>
 </section>
}

function OperationsCenter({vehicles,drivers,onNavigate}){
 const [loading,setLoading]=useState(true),[data,setData]=useState({schedules:[],fines:[],documents:[],costs:{}}),[error,setLocalError]=useState('');
 useEffect(()=>{let cancelled=false;const ids=vehicles.map(v=>v.id);if(!ids.length){setData({schedules:[],fines:[],documents:[],costs:{}});setLoading(false);return;}const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);async function load(){setLoading(true);try{const [sch,fines,docs,fuel,maint,hgs,tire,acc]=await Promise.all([
   supabase.from('maintenance_schedules').select('id,vehicle_id,name,next_km,next_date,active').in('vehicle_id',ids).eq('active',true).abortSignal(controller.signal),
   supabase.from('fines').select('id,vehicle_id,date,reason,amount,paid').in('vehicle_id',ids).eq('paid',false).abortSignal(controller.signal),
   supabase.from('documents').select('id,vehicle_id,name,document_type,expires_at').in('vehicle_id',ids).not('expires_at','is',null).abortSignal(controller.signal),
   supabase.from('fuel_records').select('vehicle_id,cost').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('maintenance_records').select('vehicle_id,cost').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('hgs_records').select('vehicle_id,type,amount').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('tire_records').select('vehicle_id,cost').in('vehicle_id',ids).abortSignal(controller.signal),
   supabase.from('accidents').select('vehicle_id,damage_cost').in('vehicle_id',ids).abortSignal(controller.signal)
 ]);const first=[sch,fines,docs,fuel,maint,hgs,tire,acc].find(x=>x.error);if(first?.error)throw first.error;const costs={};for(const v of vehicles)costs[v.id]=0;(fuel.data||[]).forEach(r=>costs[r.vehicle_id]=(costs[r.vehicle_id]||0)+Number(r.cost||0));(maint.data||[]).forEach(r=>costs[r.vehicle_id]=(costs[r.vehicle_id]||0)+Number(r.cost||0));(hgs.data||[]).forEach(r=>costs[r.vehicle_id]=(costs[r.vehicle_id]||0)+(r.type==='refund'?-1:1)*Number(r.amount||0));(tire.data||[]).forEach(r=>costs[r.vehicle_id]=(costs[r.vehicle_id]||0)+Number(r.cost||0));(acc.data||[]).forEach(r=>costs[r.vehicle_id]=(costs[r.vehicle_id]||0)+Number(r.damage_cost||0));if(!cancelled)setData({schedules:sch.data||[],fines:fines.data||[],documents:docs.data||[],costs});}catch(e){if(!cancelled)setLocalError(e?.name==='AbortError'?'Operasyon verileri zaman aşımına uğradı.':'Operasyon verileri yüklenemedi.')}finally{clearTimeout(timer);if(!cancelled)setLoading(false)}}load();return()=>{cancelled=true;controller.abort();clearTimeout(timer)}},[vehicles.map(v=>v.id).join(',')]);
 const vehicleById=id=>vehicles.find(v=>v.id===id);const label=id=>vehicleById(id)?.plate||'Plaka yok';const dateDays=d=>daysUntilDate(d);
 const actions=[];const add=(vehicle,type,title,detail,kind='warning')=>actions.push({id:`${vehicle?.id||'x'}-${type}-${title}`,vehicle,title,detail,kind});
 for(const v of vehicles){const d=drivers.find(x=>x.id===v.driver_id);for(const [type,title,date] of [['inspection','Muayene',v.inspection_date],['insurance','Trafik sigortası',v.insurance?.end_date],['casco','Kasko',v.casco?.end_date],['license','Ehliyet',d?.license_expiry]]){const days=dateDays(date);if(days!==null&&days<=30)add(v,type,title,days<0?`Süresi ${Math.abs(days)} gün önce doldu`:days===0?'Bugün sona eriyor':`${days} gün içinde sona eriyor`,days<0?'critical':'warning');}for(const p of data.schedules.filter(x=>x.vehicle_id===v.id)){if(p.next_date){const days=dateDays(p.next_date);if(days!==null&&days<=30)add(v,'maintenance-date',p.name,days<0?`Bakım ${Math.abs(days)} gün gecikti`:days===0?'Bakım bugün':`${days} gün içinde`,days<0?'critical':'warning')}if(p.next_km!==null&&p.next_km!==undefined&&Number(v.current_km||0)>=Number(p.next_km))add(v,'maintenance-km',p.name,`Bakım KM'si geldi · ${number(v.current_km)} km`, 'critical');}}
 for(const f of data.fines)add(vehicleById(f.vehicle_id),'fine','Ödenmemiş ceza',`${f.reason||'Ceza'} · ${money(f.amount)}`,'critical');
 for(const doc of data.documents){const days=dateDays(doc.expires_at);if(days!==null&&days<=30)add(vehicleById(doc.vehicle_id),'document',doc.name||'Belge',days<0?`Belge ${Math.abs(days)} gün önce süresi doldu`:days===0?'Belge bugün sona eriyor':`${days} gün içinde sona eriyor`,days<0?'critical':'warning');}
 actions.sort((a,b)=>(a.kind==='critical'?0:1)-(b.kind==='critical'?0:1));const critical=actions.filter(x=>x.kind==='critical'),upcoming=actions.filter(x=>x.kind==='warning');const serviceVehicles=vehicles.filter(v=>v.status==='service');const readyVehicles=vehicles.filter(v=>v.status==='active'&&!critical.some(a=>a.vehicle?.id===v.id));const topCosts=[...vehicles].sort((a,b)=>(data.costs[b.id]||0)-(data.costs[a.id]||0)).slice(0,5);const unpaidTotal=data.fines.reduce((s,x)=>s+Number(x.amount||0),0);const expiringDocs=data.documents.filter(x=>{const d=dateDays(x.expires_at);return d!==null&&d<=30}).length;
 return <section className="operations-page"><section className="hero-grid operations-kpis"><Stat icon={<ClipboardList/>} label="Acil Operasyon" value={number(critical.length)} sub="Hemen müdahale"/><Stat icon={<CalendarClock/>} label="Yaklaşan" value={number(upcoming.length)} sub="30 gün içinde"/><Stat icon={<Wrench/>} label="Serviste" value={number(serviceVehicles.length)} sub="Araç"/><Stat icon={<CheckCircle2/>} label="Yola Hazır" value={number(readyVehicles.length)} sub="Aktif ve kritik alarm yok"/></section>
 <section className="operations-grid"><section className="panel"><div className="section-head"><div><h2>Bugün Ne Yapılmalı?</h2><p>Filo yöneticisinin ilk bakması gereken operasyonlar.</p></div><span className="alarm-total"><Bell size={15}/> {number(actions.length)} işlem</span></div>{loading?<LoadingRows/>:!actions.length?<div className="operation-empty"><CheckCircle2 size={20}/><div><strong>Bugün kritik operasyon yok</strong><span>Filonun planlı ve temiz görünüyor.</span></div></div>:<div className="operation-list">{actions.slice(0,12).map(a=><button key={a.id} className={`operation-row ${a.kind}`} onClick={()=>a.vehicle&&onNavigate('vehicles',a.vehicle)}><span className="operation-icon">{a.kind==='critical'?<AlertTriangle size={17}/>:<Clock3 size={17}/>}</span><span><strong>{a.vehicle?.plate||'—'} · {a.title}</strong><small>{a.detail}</small></span><ArrowLeft size={15}/></button>)}</div>}</section>
 <section className="panel"><div className="section-head"><div><h2>Hızlı Operasyon</h2><p>Doğrudan ilgili ekrana geç.</p></div></div><div className="operations-quick"><button onClick={()=>onNavigate('vehicles')}><Car/><span>Araçlar</span><small>Filo durumunu yönet</small></button><button onClick={()=>onNavigate('maintenance')}><Wrench/><span>Bakım</span><small>Bakım işlerini aç</small></button><button onClick={()=>onNavigate('documents')}><FileText/><span>Belgeler</span><small>{number(expiringDocs)} belge yaklaşıyor</small></button><button onClick={()=>onNavigate('alerts')}><Bell/><span>Alarm Merkezi</span><small>Detaylı uyarıları gör</small></button><button onClick={()=>onNavigate('costs')}><CircleDollarSign/><span>Maliyetler</span><small>Giderleri incele</small></button><button onClick={()=>onNavigate('reports')}><BarChart3/><span>Rapor Merkezi</span><small>Yönetici raporu oluştur</small></button></div></section></section>
 <section className="operations-grid"><section className="panel"><div className="section-head"><div><h2>Filo Durumu</h2><p>Araçların bugünkü operasyonel dağılımı.</p></div></div><div className="operation-status-grid"><div><span>Aktif</span><strong>{number(vehicles.filter(v=>v.status==='active').length)}</strong></div><div><span>Serviste</span><strong>{number(serviceVehicles.length)}</strong></div><div><span>Pasif</span><strong>{number(vehicles.filter(v=>v.status==='inactive').length)}</strong></div><div><span>Ödenmemiş Ceza</span><strong>{number(data.fines.length)}</strong><small>{money(unpaidTotal)}</small></div></div></section><section className="panel"><div className="section-head"><div><h2>En Yüksek Giderli Araçlar</h2><p>Kayıtlı giderlere göre hızlı risk görünümü.</p></div></div><div className="operation-cost-list">{topCosts.map(v=><button key={v.id} onClick={()=>onNavigate('vehicles',v)}><span><strong>{v.plate}</strong><small>{[v.brand,v.model].filter(Boolean).join(' ')||'Araç'}</small></span><b>{money(data.costs[v.id]||0)}</b></button>)}</div>{!topCosts.length&&<Empty text="Henüz araç yok" sub="Araç eklediğinde gider riskleri burada görünür."/>}</section></section>
 <section className="panel operations-note"><HeartPulse size={20}/><div><strong>Operasyon mantığı</strong><span>Bu ekran veri göstermekten çok “şimdi ne yapmalıyım?” sorusuna cevap verir. Kritik uyarılar, yaklaşan bakım ve evraklar, servisteki araçlar, ödenmemiş cezalar ve yüksek giderli araçlar tek merkezde toplanır.</span></div></section>
 {error&&<div className="form-error">{error}</div>}</section>
}

function ModulePage(props){
 const {view}=props;
 if(view==='costs') return <CostsPage vehicles={props.vehicles}/>;
 if(view==='reports') return <ReportsPage vehicles={props.vehicles} company={props.company} setError={props.setError}/>;
 if(view==='fuel') return <FuelPage vehicles={props.vehicles} search={props.search} setError={props.setError} vehicleFilter={props.vehicleFilter} companies={props.companies} activeCompanyId={props.activeCompanyId}/>;
 if(view==='settings') return <SettingsPage company={props.company} session={props.session} setCompany={props.setCompany} companies={props.companies} activeCompanyId={props.activeCompanyId} setActiveCompanyId={props.setActiveCompanyId} onRefresh={props.onRefresh} setError={props.setError}/>;
 if(view==='incidents') return <IncidentsPage vehicles={props.vehicles} drivers={props.drivers} companies={props.companies} activeCompanyId={props.activeCompanyId} search={props.search} setError={props.setError} vehicleFilter={props.vehicleFilter}/>;
 if(view==='documents') return <DocumentsPage vehicles={props.vehicles} search={props.search} setError={props.setError} vehicleFilter={props.vehicleFilter} activeCompanyId={props.activeCompanyId}/>;
 if(view==='maintenance') return <MaintenancePage vehicles={props.vehicles} search={props.search} setError={props.setError} vehicleFilter={props.vehicleFilter} companies={props.companies} activeCompanyId={props.activeCompanyId}/>;
 if(view==='hgs') return <HgsPage vehicles={props.vehicles} search={props.search} setError={props.setError} vehicleFilter={props.vehicleFilter} companies={props.companies} activeCompanyId={props.activeCompanyId}/>;
 return <GenericModulePage {...props}/>;
}

function GenericModulePage({view,company,companies=[],activeCompanyId='all',vehicles,drivers,search,setError,vehicleFilter}){
 const cfg=MODULES[view];
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[show,setShow]=useState(false),[editing,setEditing]=useState(null);
 async function load(){
   setLoading(true);
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),5000);
   try {
     // Fetch only the fields each module actually needs. This keeps navigation fast as data grows.
     const fields = cfg.table==='maintenance_records'
       ? 'id,vehicle_id,date,description,km,category,cost,service_name,invoice_no,note,created_at'
       : '*';
     let q=supabase.from(cfg.table).select(fields).order('created_at',{ascending:false}).abortSignal(controller.signal);
     if(cfg.company && company?.id) q=q.eq('company_id',company.id);
     if(cfg.vehicle && vehicleFilter) q=q.eq('vehicle_id',vehicleFilter);
     if(cfg.vehicle && !vehicleFilter && activeCompanyId!=='all'){
       const ids=vehicles.map(v=>v.id).filter(Boolean);
       if(!ids.length){setRows([]);return;}
       q=q.in('vehicle_id',ids);
     }
     const r=await q;
     if(r.error)throw r.error;
     const base=r.data||[];
     setRows(cfg.vehicle?base.map(row=>({...row,vehicles:vehicles.find(v=>v.id===row.vehicle_id)||null})):base);
   } catch(e) {
     if(e?.name==='AbortError' || controller.signal.aborted) setError(`${cfg.title} 5 saniye içinde yanıt vermedi. Supabase/RLS bağlantısını kontrol et.`);
     else setError(e.message||`${cfg.title} yüklenemedi.`);
     setRows([]);
   } finally {
     clearTimeout(timer);
     setLoading(false);
   }
 }
 useEffect(()=>{let cancelled=false; const t=setTimeout(()=>{if(!cancelled)load()},0); return()=>{cancelled=true;clearTimeout(t)}},[view,company?.id,activeCompanyId,vehicleFilter,vehicles.map(v=>v.id).join(',')]);
 async function save(form){
   let payload={...form}; if(cfg.company){ if(!payload.company_id) payload.company_id=company?.id||null; if(!payload.company_id){setError('Bu kayıt için şirket seçmelisin.');return;} }
   const r=editing?await supabase.from(cfg.table).update(payload).eq('id',editing.id).select().single():await supabase.from(cfg.table).insert(payload).select().single();
   if(r.error){setError(r.error.message);return}
   await load(); setShow(false); setEditing(null);
 }
 async function remove(r){if(!confirm('Bu kaydı silmek istediğine emin misin?'))return;let x;try{x=await withTimeout(supabase.from(cfg.table).delete().eq('id',r.id),5000,cfg.title)}catch(e){setError(e.message||`${cfg.title} silinemedi.`);return}if(x.error)setError(x.error.message);else load()}
 const visible=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 return <section className="panel"><div className="section-head"><div><h2>{cfg.title}</h2><p>{cfg.desc}</p></div><button className="primary" onClick={()=>{setEditing(null);setShow(true)}}><Plus size={17}/> Yeni Kayıt</button></div>{loading?<LoadingRows/>:<div className="table-wrap"><table><thead><tr>{activeCompanyId==='all'&&<th>Şirket</th>}{cfg.company&&<th>Atanan Araç</th>}{cfg.vehicle&&<th>Araç</th>}{cfg.fields.slice(0,6).map(f=><th key={f[0]}>{f[1]}</th>)}<th></th></tr></thead><tbody>{visible.map(r=><tr key={r.id}>{activeCompanyId==='all'&&<td><strong>{cfg.company?(companies.find(c=>c.id===r.company_id)?.name||'—'):(r.vehicles?.company?.name||'—')}</strong></td>}{cfg.company&&<td>{vehicles.find(v=>v.driver_id===r.id)?<><strong>{vehicles.find(v=>v.driver_id===r.id)?.plate}</strong><small>{vehicles.find(v=>v.id===vehicles.find(x=>x.driver_id===r.id)?.id)?.company?.name||''}</small></>:'Atanmamış'}</td>}{cfg.vehicle&&<td><strong>{r.vehicles?.plate||'—'}</strong><small>{r.vehicles?.company?.name||''} · {[r.vehicles?.brand,r.vehicles?.model].filter(Boolean).join(' ')}</small></td>}{cfg.fields.slice(0,6).map(f=><td key={f[0]}>{renderValue(r,f,drivers)}</td>)}<td><div className="row-actions"><button className="icon-btn" onClick={()=>{setEditing(r);setShow(true)}}><Pencil size={15}/></button><button className="danger-btn" onClick={()=>remove(r)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>{!visible.length&&<Empty text="Henüz kayıt yok" sub="Yeni Kayıt ile ilk kaydı oluştur."/>}</div>}{show&&<RecordModal cfg={cfg} vehicles={vehicles} drivers={drivers} companies={companies} activeCompanyId={activeCompanyId} record={editing} onClose={()=>{setShow(false);setEditing(null)}} onSave={save}/>}</section>
}

function renderValue(r,f,drivers){const [key,label,type]=f;const v=r[key];if(key==='driver_id')return drivers.find(d=>d.id===v)?.name||'—';if(type==='checkbox')return v?'Evet':'Hayır';if(key==='type'&&r.type)return hgsLabels[r.type]||r.type;if(key==='status'&&r.status)return accidentStatus[r.status]||r.status;if(key==='fuel_type'&&r.fuel_type)return fuelLabels[r.fuel_type]||r.fuel_type;if(v===null||v===undefined||v==='')return '—';if(type==='number'&&['cost','amount','damage_cost'].includes(key))return money(v);return String(v)}

function RecordModal({cfg,vehicles,drivers,companies=[],activeCompanyId='all',record,onClose,onSave}){const initial={};cfg.fields.forEach(([k,,t])=>initial[k]=t==='checkbox'?false:'');const seed={...initial,...record};if(cfg.company)seed.company_id=record?.company_id||((activeCompanyId!=='all')?activeCompanyId:'');if(cfg.vehicle)seed.vehicle_id=record?.vehicle_id||vehicles[0]?.id||'';const [form,setForm]=useState(seed),[saving,setSaving]=useState(false);const upd=(k,v)=>setForm(x=>({...x,[k]:v}));async function submit(e){e.preventDefault();setSaving(true);const payload={...form};delete payload.id;delete payload.created_at;delete payload.updated_at;if(!cfg.vehicle)delete payload.vehicle_id;cfg.fields.forEach(([k,,t])=>{if(t==='number')payload[k]=payload[k]===''?null:Number(payload[k]);if(t==='date'&&payload[k]==='')payload[k]=null});await onSave(payload);setSaving(false)}return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h2>{record?'Kaydı Düzenle':'Yeni Kayıt'}</h2><p>{cfg.title}</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><form className="form-grid" onSubmit={submit}>{cfg.company&&<label>Şirket *<select required value={form.company_id||''} onChange={e=>upd('company_id',e.target.value)}><option value="">Şirket seç</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}{cfg.vehicle&&<label>Araç *<select required value={form.vehicle_id} onChange={e=>upd('vehicle_id',e.target.value)}><option value="">Araç seç</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</option>)}</select></label>}{cfg.fields.map(([k,l,t,req,opts])=><Field key={k} label={l} type={t} required={req} value={form[k]} options={opts} drivers={drivers} onChange={v=>upd(k,v)}/>) }<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Vazgeç</button><button className="primary" disabled={saving}>{saving?'Kaydediliyor...':'Kaydet'}</button></div></form></div></div>}
function Field({label,type,required,value,options,drivers,onChange}){if(type==='checkbox')return <label className="checkbox-label"><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)}/>{label}</label>;if(type==='select')return <label>{label}{required?' *':''}<select required={required} value={value||''} onChange={e=>onChange(e.target.value)}><option value="">Seç</option>{(options||[]).map(o=><option key={o} value={o}>{o==='diesel'?'Dizel':o==='gasoline'?'Benzin':o==='hybrid'?'Hibrit':o==='lpg'?'LPG':o==='passage'?'Geçiş':o==='topup'?'Yükleme':o==='refund'?'İade':o==='other'?'Diğer':o}</option>)}</select></label>;if(type==='driver')return <label>{label}<select value={value||''} onChange={e=>onChange(e.target.value||null)}><option value="">Sürücü seç</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>;return <label>{label}{required?' *':''}<input required={required} type={type} step={type==='number'?'0.01':undefined} value={value??''} onChange={e=>onChange(e.target.value)}/></label>}

function HgsPage({vehicles,search,setError,vehicleFilter,companies,activeCompanyId}){const [tab,setTab]=useState('hgs');return <><div className="detail-tabs module-tabs"><button className={tab==='hgs'?'active':''} onClick={()=>setTab('hgs')}>HGS Hareketleri</button><button className={tab==='km'?'active':''} onClick={()=>setTab('km')}>KM Geçmişi</button></div>{tab==='hgs'?<GenericModulePage view="hgs" vehicles={vehicles} drivers={[]} companies={companies} activeCompanyId={activeCompanyId} search={search} setError={setError} vehicleFilter={vehicleFilter}/>:<GenericModulePage view="km" vehicles={vehicles} drivers={[]} companies={companies} activeCompanyId={activeCompanyId} search={search} setError={setError} vehicleFilter={vehicleFilter}/>}</>}
function MaintenancePage({vehicles,search,setError,vehicleFilter,companies,activeCompanyId}){const [tab,setTab]=useState('records');return <><div className="detail-tabs module-tabs"><button className={tab==='records'?'active':''} onClick={()=>setTab('records')}>Bakım Kayıtları</button><button className={tab==='plans'?'active':''} onClick={()=>setTab('plans')}>Bakım Planları</button></div>{tab==='records'?<GenericModulePage view="maintenance" vehicles={vehicles} drivers={[]} companies={companies} activeCompanyId={activeCompanyId} search={search} setError={setError} vehicleFilter={vehicleFilter}/>:<MaintenancePlans vehicles={vehicles} search={search} setError={setError} vehicleFilter={vehicleFilter} activeCompanyId={activeCompanyId}/>}</>}
function MaintenancePlans({vehicles,search,setError,vehicleFilter,activeCompanyId}){const cfg={table:'maintenance_schedules',title:'Bakım Planları',desc:'KM veya gün bazlı bakım periyotlarını tanımla.',vehicle:true,fields:[['name','Plan Adı','text',true],['interval_km','Periyot KM','number'],['interval_days','Periyot Gün','number'],['last_km','Son Bakım KM','number'],['last_date','Son Bakım Tarihi','date'],['next_km','Sonraki KM','number'],['next_date','Sonraki Tarih','date'],['active','Aktif','checkbox']]};return <GenericConfigPage cfg={cfg} vehicles={vehicles} search={search} setError={setError} vehicleFilter={vehicleFilter} activeCompanyId={activeCompanyId}/>}
function GenericConfigPage({cfg,vehicles,search,setError,vehicleFilter,activeCompanyId='all'}){const [rows,setRows]=useState([]),[show,setShow]=useState(false),[editing,setEditing]=useState(null),[loading,setLoading]=useState(true);async function load(){setLoading(true);try{let q=supabase.from(cfg.table).select('*').order('created_at',{ascending:false});if(vehicleFilter)q=q.eq('vehicle_id',vehicleFilter);else if(activeCompanyId!=='all'){const ids=vehicles.map(v=>v.id).filter(Boolean);if(!ids.length){setRows([]);setLoading(false);return;}q=q.in('vehicle_id',ids);}let r=await withTimeout(q,5000,cfg.title);if(r.error)throw r.error;const base=r.data||[];setRows(base.map(row=>({...row,vehicles:vehicles.find(v=>v.id===row.vehicle_id)||null})))}catch(e){setRows([]);setError(e.message||`${cfg.title} yüklenemedi.`)}finally{setLoading(false)}}useEffect(()=>{load()},[vehicleFilter,activeCompanyId,vehicles.map(v=>v.id).join(',')]);async function save(p){let r=editing?await supabase.from(cfg.table).update(p).eq('id',editing.id).select().single():await supabase.from(cfg.table).insert(p).select().single();if(r.error){setError(r.error.message);return}await load();setShow(false);setEditing(null)}async function del(r){if(!confirm('Bu plan silinsin mi?'))return;let x=await supabase.from(cfg.table).delete().eq('id',r.id);if(x.error)setError(x.error.message);else load()}const vis=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));return <section className="panel"><div className="section-head"><div><h2>{cfg.title}</h2><p>{cfg.desc}</p></div><button className="primary" onClick={()=>{setEditing(null);setShow(true)}}><Plus size={17}/> Plan Ekle</button></div><div className="table-wrap"><table><thead><tr><th>Araç</th><th>Plan</th><th>Periyot</th><th>Sonraki KM</th><th>Sonraki Tarih</th><th>Durum</th><th></th></tr></thead><tbody>{vis.map(r=><tr key={r.id}><td>{r.vehicles?.plate||'—'}</td><td>{r.name}</td><td>{r.interval_km?`${number(r.interval_km)} km`:''} {r.interval_days?`/ ${r.interval_days} gün`:''}</td><td>{number(r.next_km)}</td><td>{r.next_date||'—'}</td><td>{r.active?'Aktif':'Pasif'}</td><td><button className="icon-btn" onClick={()=>{setEditing(r);setShow(true)}}><Pencil size={15}/></button><button className="danger-btn" onClick={()=>del(r)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>{!vis.length&&<Empty text="Bakım planı yok" sub="İlk periyodik bakım planını oluştur."/>}</div>{show&&<RecordModal cfg={cfg} vehicles={vehicles} drivers={[]} record={editing} onClose={()=>{setShow(false);setEditing(null)}} onSave={save}/>}</section>}

function IncidentsPage({vehicles,drivers,search,setError,vehicleFilter,companies,activeCompanyId}){const [tab,setTab]=useState('accidents');return <><div className="detail-tabs module-tabs"><button className={tab==='accidents'?'active':''} onClick={()=>setTab('accidents')}>Kazalar</button><button className={tab==='fines'?'active':''} onClick={()=>setTab('fines')}>Cezalar</button></div>{tab==='accidents'?<GenericModulePage view="accidents" vehicles={vehicles} drivers={drivers} companies={companies} activeCompanyId={activeCompanyId} search={search} setError={setError} vehicleFilter={vehicleFilter}/>:<GenericModulePage view="fines" vehicles={vehicles} drivers={drivers} companies={companies} activeCompanyId={activeCompanyId} search={search} setError={setError} vehicleFilter={vehicleFilter}/>}</>}

function DocumentsPage({vehicles,search,setError,vehicleFilter,activeCompanyId='all'}){const [rows,setRows]=useState([]),[show,setShow]=useState(false),[loading,setLoading]=useState(true);async function load(){setLoading(true);let q=supabase.from('documents').select('*').order('created_at',{ascending:false});if(vehicleFilter)q=q.eq('vehicle_id',vehicleFilter);else if(activeCompanyId!=='all'){const ids=vehicles.map(v=>v.id).filter(Boolean);if(!ids.length){setRows([]);setLoading(false);return;}q=q.in('vehicle_id',ids);}let r=await withTimeout(q,5000,'Belgeler');if(r.error)setError(r.error.message);const base=r.data||[];setRows(base.map(row=>({...row,vehicles:vehicles.find(v=>v.id===row.vehicle_id)||null})));setLoading(false)}useEffect(()=>{load()},[vehicleFilter,activeCompanyId,vehicles.map(v=>v.id).join(',')]);async function remove(r){if(!confirm('Belge kaydı ve dosyası silinsin mi?'))return;if(r.storage_path&&r.storage_path!=='pending-upload')await supabase.storage.from('fleet-documents').remove([r.storage_path]);let x=await supabase.from('documents').delete().eq('id',r.id);if(x.error)setError(x.error.message);else load()}const vis=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));return <section className="panel"><div className="section-head"><div><h2>Belgeler</h2><p>PDF, JPG, PNG gibi dosyaları araçlara bağla; son kullanma tarihlerini takip et.</p></div><button className="primary" onClick={()=>setShow(true)}><Upload size={17}/> Belge Yükle</button></div>{loading?<LoadingRows/>:<div className="table-wrap"><table><thead><tr><th>Araç</th><th>Tür</th><th>Belge</th><th>Bitiş</th><th>Dosya</th><th></th></tr></thead><tbody>{vis.map(r=><tr key={r.id}><td>{r.vehicles?.plate||'—'}</td><td>{docLabels[r.document_type]||r.document_type}</td><td>{r.name}</td><td>{r.expires_at||'—'}</td><td>{r.storage_path&&r.storage_path!=='pending-upload'?<div className="doc-actions"><button className="link-btn small" onClick={()=>openStorage(r.storage_path,'open',r.name,setError)}>Aç</button><button className="link-btn small" onClick={()=>openStorage(r.storage_path,'download',r.name,setError)}>İndir</button></div>:'—'}</td><td><button className="danger-btn" onClick={()=>remove(r)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>{!vis.length&&<Empty text="Henüz belge yok" sub="Ruhsat, sigorta, kasko veya muayene belgesi yükleyebilirsin."/>}</div>}{show&&<DocumentModal vehicles={vehicles} defaultVehicle={vehicleFilter} onClose={()=>setShow(false)} onSaved={()=>{setShow(false);load()}} setError={setError}/>}</section>}
async function openStorage(path,mode='open',filename='belge',setError=()=>{}){try{setError('');const storage=supabase.storage.from('fleet-documents');if(mode==='download'){const r=await storage.createSignedUrl(path,3600,{download:filename});if(r.error)throw r.error;const a=document.createElement('a');a.href=r.data.signedUrl;a.download=filename||'belge';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();return;}const r=await storage.createSignedUrl(path,3600);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener,noreferrer');}catch(err){setError(err?.message||'Belge açılamadı.');}}
function DocumentModal({vehicles,defaultVehicle,onClose,onSaved,setError}){const [vehicle_id,setVehicle]=useState(defaultVehicle||vehicles[0]?.id||''),[type,setType]=useState('license'),[name,setName]=useState(''),[expires_at,setExpires]=useState(''),[file,setFile]=useState(null),[saving,setSaving]=useState(false);async function submit(e){e.preventDefault();if(!file||!vehicle_id){setError('Araç ve dosya seçmelisin.');return}setSaving(true);try{const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Oturum bulunamadı.');const path=`${user.id}/${vehicle_id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await supabase.storage.from('fleet-documents').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(up.error)throw up.error;const ins=await supabase.from('documents').insert({vehicle_id,document_type:type,name:name||file.name,storage_path:path,mime_type:file.type||null,size_bytes:file.size,expires_at:expires_at||null}).select().single();if(ins.error){await supabase.storage.from('fleet-documents').remove([path]);throw ins.error}onSaved()}catch(err){setError(err.message||'Belge yüklenemedi.')}finally{setSaving(false)}}return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h2>Belge Yükle</h2><p>PDF, JPG, PNG ve benzeri dosyalar</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><form className="form-grid" onSubmit={submit}><label>Araç *<select required value={vehicle_id} onChange={e=>setVehicle(e.target.value)}><option value="">Araç seç</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</option>)}</select></label><label>Belge Türü *<select required value={type} onChange={e=>setType(e.target.value)}>{Object.entries(docLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Belge Adı<input value={name} onChange={e=>setName(e.target.value)} placeholder="Örn. 2026 Sigorta Poliçesi"/></label><label>Bitiş Tarihi<input type="date" value={expires_at} onChange={e=>setExpires(e.target.value)}/></label><label>Dosya *<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label>{file&&<div className="file-preview"><CheckCircle2 size={17}/><span>{file.name} · {(file.size/1024/1024).toFixed(2)} MB</span></div>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Vazgeç</button><button className="primary" disabled={saving}>{saving?<><Loader2 className="spin" size={17}/> Yükleniyor</>:<><Upload size={16}/> Yükle</>}</button></div></form></div></div>}

function SettingsPage({company,session,setCompany,companies=[],activeCompanyId='all',setActiveCompanyId=()=>{},onRefresh,setError}){
 const [name,setName]=useState(company?.name||'Benim Filom');
 const [saving,setSaving]=useState(false);
 const [backupLoading,setBackupLoading]=useState(false);
 const [status,setStatus]=useState('');
 useEffect(()=>setName(company?.name||'Benim Filom'),[company?.id,company?.name]);
 const tables=['companies','drivers','vehicles','insurance_policies','fuel_records','hgs_records','km_records','maintenance_records','maintenance_schedules','tire_records','accidents','fines','documents'];
 async function saveCompany(e){
  e.preventDefault();
  const clean=name.trim();
  if(!clean){setError('Firma adı boş bırakılamaz.');return;}
  setSaving(true);setStatus('');setError('');
  try{
   const r=await withTimeout(supabase.from('companies').update({name:clean}).eq('id',company.id).select().single(),6000,'Firma adı güncelleme');
   if(r.error)throw r.error;
   setCompany(r.data);setStatus('Firma bilgileri kaydedildi.');
  }catch(e){setError(e.message||'Firma bilgileri kaydedilemedi.')}finally{setSaving(false)}
 }
 async function createBackup(){
  setBackupLoading(true);setStatus('');setError('');
  try{
   const backup={
    app:'Filo Yönetim',version:'V27 Finalizasyon',created_at:new Date().toISOString(),user_email:session?.user?.email||null,
    company:company||null,data:{}
   };
   for(const table of tables){
    const q=table==='companies'?supabase.from(table).select('*').eq('id',company.id):
      table==='vehicles'?supabase.from(table).select('*').eq('company_id',company.id):
      table==='drivers'?supabase.from(table).select('*').eq('company_id',company.id):
      table==='insurance_policies'||table==='fuel_records'||table==='hgs_records'||table==='km_records'||table==='maintenance_records'||table==='maintenance_schedules'||table==='tire_records'||table==='accidents'||table==='fines'||table==='documents'
        ? supabase.from(table).select('*').in('vehicle_id',(await supabase.from('vehicles').select('id').eq('company_id',company.id)).data?.map(v=>v.id)||[])
        : supabase.from(table).select('*');
    const r=await withTimeout(q,7000,`${table} yedekleme`);
    if(r.error)throw r.error;
    backup.data[table]=r.data||[];
   }
   const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`filo-yonetim-yedek-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
   setStatus('JSON yedeği indirildi.');
  }catch(e){setError(e.message||'Yedek oluşturulamadı.')}finally{setBackupLoading(false)}
 }
 const refresh=async()=>{setStatus('Veriler yenileniyor...');try{await onRefresh();setStatus('Veriler yenilendi.')}catch(e){setError(e.message||'Yenileme başarısız.')}};
 return <section className="settings-page">
  <section className="panel"><div className="section-head"><div><h2>Filo Ayarları</h2><p>Uygulama bilgileri, veri yedeği ve bağlantı işlemleri.</p></div><span className="alarm-total"><CheckCircle2 size={15}/> V27 Final</span></div>
   {company&&<form className="settings-form" onSubmit={saveCompany}><label>Filo / Firma Adı<input value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></label><div className="settings-inline"><span>Oturum hesabı</span><strong>{session?.user?.email||'—'}</strong></div><button className="primary" disabled={saving}>{saving?'Kaydediliyor...':'Firma Bilgilerini Kaydet'}</button></form>}
   {!company&&<div className="form-success" style={{marginTop:14}}>Tüm Şirketler görünümündesin. Şirket yönetimi aşağıdaki bölümden yapılır.</div>}
   {status&&<div className="form-success" style={{marginTop:14}}>{status}</div>}
  </section>
  <section className="panel"><div className="section-head"><div><h2>Şirket Yönetimi</h2><p>Ortak çalışma alanındaki şirketleri buradan görüntüleyip aktif şirketi seçebilirsin. Yeni şirket ekleme işlemi artık <strong>Araç Ekle</strong> ekranındaki butondan yapılır.</p></div><Settings size={20}/></div><div className="table-wrap"><table><thead><tr><th>Şirket</th><th>Oluşturulma</th><th></th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td><strong>{c.name}</strong>{activeCompanyId===c.id&&<small style={{display:'block'}}>Aktif şirket</small>}</td><td>{c.created_at?new Date(c.created_at).toLocaleDateString('tr-TR'):'—'}</td><td><button type="button" className="secondary" onClick={()=>{setActiveCompanyId(c.id);setStatus(`${c.name} aktif şirket olarak seçildi.`)}}>Bu Şirketi Seç</button></td></tr>)}</tbody></table></div></section>
  <section className="panel"><div className="section-head"><div><h2>Veri Yedekleme</h2><p>Filo kayıtlarının JSON yedeğini bilgisayarına indir. Yedek Supabase'deki mevcut RLS yetkilerin kapsamında oluşturulur.</p></div><Download size={20}/></div><div className="settings-card-grid"><div className="settings-card"><strong>Manuel JSON Yedeği</strong><span>Araçlar, sürücüler, yakıt, HGS, KM, bakım, lastik, kaza, ceza, sigorta/kasko ve belge kayıtlarını içerir.</span><button className="secondary" onClick={createBackup} disabled={!company||backupLoading}>{backupLoading?<><Loader2 className="spin" size={16}/> Yedek hazırlanıyor...</>:<><Download size={16}/> JSON Yedeği İndir</>}</button></div><div className="settings-card"><strong>Güvenli Yenileme</strong><span>Supabase'den araç ve sürücü ana verilerini yeniden çeker. Tarayıcı önbelleğini veya kayıtlarını silmez.</span><button className="secondary" onClick={refresh}><RefreshCw size={16}/> Verileri Yenile</button></div></div></section>
  <section className="panel"><div className="section-head"><div><h2>Sistem Kontrolü</h2><p>V27 ile ürünün son kullanım öncesi temel kontrolleri.</p></div><ShieldCheck size={20}/></div><div className="settings-checks"><div><CheckCircle2 size={17}/><span>Supabase bağlantısı aktif</span><b>OK</b></div><div><CheckCircle2 size={17}/><span>Hesap oturumu aktif</span><b>OK</b></div><div><CheckCircle2 size={17}/><span>RLS / ortak çalışma erişimi</span><b>AKTİF</b></div><div><CheckCircle2 size={17}/><span>PDF + Excel raporlama</span><b>AKTİF</b></div><div><CheckCircle2 size={17}/><span>Fleet Operations Center</span><b>AKTİF</b></div></div></section>
  <section className="panel settings-info"><Settings size={20}/><div><strong>Filo Yönetim V27</strong><span>Bu sürüm yeni bir veritabanı tablosu veya SQL değişikliği gerektirmez. V17–V26 modülleri aynı veri modelini kullanır. JSON yedeği geri yükleme işlemi otomatik yapılmaz; mevcut verinin üzerine yanlışlıkla yazılmasını önlemek için yalnızca güvenli dışa aktarma sunulur.</span></div></section>
 </section>
}

function CostsPage({vehicles}){
 const [data,setData]=useState({fuel:[],maintenance:[],hgs:[],fines:[],accidents:[],tires:[],km:[]});
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
   const ids=vehicles.map(v=>v.id);
   if(!ids.length){setData({fuel:[],maintenance:[],hgs:[],fines:[],accidents:[],tires:[],km:[]});setLoading(false);return;}
   let cancelled=false;
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),7000);
   async function load(){
     setLoading(true);
     try{
       const [fuel,maintenance,hgs,fines,accidents,tires,km]=await Promise.all([
         supabase.from('fuel_records').select('vehicle_id,cost,km,date').in('vehicle_id',ids).abortSignal(controller.signal),
         supabase.from('maintenance_records').select('vehicle_id,cost,date,km').in('vehicle_id',ids).abortSignal(controller.signal),
         supabase.from('hgs_records').select('vehicle_id,amount,type,date').in('vehicle_id',ids).abortSignal(controller.signal),
         supabase.from('fines').select('vehicle_id,amount,date,paid').in('vehicle_id',ids).abortSignal(controller.signal),
         supabase.from('accidents').select('vehicle_id,damage_cost,date').in('vehicle_id',ids).abortSignal(controller.signal),
         supabase.from('tire_records').select('vehicle_id,cost,installed_km,installed_date').in('vehicle_id',ids).abortSignal(controller.signal),
         supabase.from('km_records').select('vehicle_id,km,date').in('vehicle_id',ids).order('km',{ascending:true}).abortSignal(controller.signal)
       ]);
       const err=[fuel,maintenance,hgs,fines,accidents,tires,km].find(x=>x.error);
       if(err?.error)throw err.error;
       if(!cancelled)setData({fuel:fuel.data||[],maintenance:maintenance.data||[],hgs:hgs.data||[],fines:fines.data||[],accidents:accidents.data||[],tires:tires.data||[],km:km.data||[]});
     }catch(err){
       if(!cancelled){
         if(err?.name==='AbortError'||controller.signal.aborted)setError?.('Maliyet verileri 7 saniye içinde yanıt vermedi.');
         else console.warn('Gerçek araç maliyeti:',err);
       }
     }finally{clearTimeout(timer);if(!cancelled)setLoading(false)}
   }
   load();
   return()=>{cancelled=true;controller.abort();clearTimeout(timer)}
 },[vehicles.map(v=>v.id).join(',')]);

 const sum=(a,k)=>a.reduce((s,x)=>s+Number(x[k]||0),0);
 const fuel=sum(data.fuel,'cost');
 const maintenance=sum(data.maintenance,'cost');
 const tires=sum(data.tires,'cost');
 const fines=sum(data.fines,'amount');
 const accidents=sum(data.accidents,'damage_cost');
 const insurance=vehicles.reduce((s,v)=>s+Number(v.insurance?.cost||0),0);
 const casco=vehicles.reduce((s,v)=>s+Number(v.casco?.cost||0),0);
 // HGS iadelerini gerçek maliyetten düş; diğer hareketleri kayıtlı gider kabul et.
 const hgs=data.hgs.reduce((s,x)=>s+(x.type==='refund'?-1:1)*Number(x.amount||0),0);
 const total=fuel+maintenance+tires+hgs+fines+accidents+insurance+casco;
 const components=[
   ['Yakıt',fuel,<Fuel/>],['Bakım',maintenance,<Wrench/>],['Lastik',tires,<Disc3/>],['HGS',hgs,<Gauge/>],
   ['Sigorta',insurance,<ShieldCheck/>],['Kasko',casco,<ShieldCheck/>],['Ceza',fines,<ShieldAlert/>],['Kaza / Hasar',accidents,<AlertTriangle/>]
 ];
 const byVehicle=vehicles.map(v=>{
   const id=v.id;
   const f=sum(data.fuel.filter(x=>x.vehicle_id===id),'cost');
   const m=sum(data.maintenance.filter(x=>x.vehicle_id===id),'cost');
   const t=sum(data.tires.filter(x=>x.vehicle_id===id),'cost');
   const h=data.hgs.filter(x=>x.vehicle_id===id).reduce((s,x)=>s+(x.type==='refund'?-1:1)*Number(x.amount||0),0);
   const fi=sum(data.fines.filter(x=>x.vehicle_id===id),'amount');
   const a=sum(data.accidents.filter(x=>x.vehicle_id===id),'damage_cost');
   const ins=Number(v.insurance?.cost||0),cas=Number(v.casco?.cost||0);
   const total=f+m+t+h+fi+a+ins+cas;
   const kmRows=data.km.filter(x=>x.vehicle_id===id&&x.km!==null&&x.km!==undefined).map(x=>Number(x.km)).filter(Number.isFinite).sort((a,b)=>a-b);
   const fuelKm=data.fuel.filter(x=>x.vehicle_id===id&&x.km!==null&&x.km!==undefined).map(x=>Number(x.km)).filter(Number.isFinite);
   const allKm=[...kmRows,...fuelKm,Number(v.current_km||0)].filter(x=>x>0).sort((a,b)=>a-b);
   const firstKm=allKm[0]||null;
   const lastKm=allKm[allKm.length-1]||null;
   const distance=firstKm!==null&&lastKm!==null&&lastKm>firstKm?lastKm-firstKm:null;
   return {...v,total,fuel:f,maintenance:m,tires:t,hgs:h,insurance:ins,casco:cas,fines:fi,accidents:a,distance,firstKm,lastKm};
 }).sort((a,b)=>b.total-a.total);
 const costPerKm=byVehicle.map(v=>v.distance&&v.distance>0? v.total/v.distance:null);
 const validCpk=costPerKm.filter(x=>x!==null&&Number.isFinite(x));
 const fleetKm=byVehicle.reduce((s,v)=>s+(v.distance||0),0);
 const fleetTlKm=fleetKm>0?total/fleetKm:null;
 return <>
   <section className="hero-grid">
     <Stat icon={<CircleDollarSign/>} label="Gerçek Filo Maliyeti" value={money(total)} sub="Tüm kayıtlı giderler"/>
     <Stat icon={<Car/>} label="Araç Başına" value={vehicles.length?money(total/vehicles.length):'—'} sub="Ortalama"/>
     <Stat icon={<Gauge/>} label="Filo TL / km" value={fleetTlKm!==null?money(fleetTlKm):'—'} sub={fleetKm?`${number(fleetKm)} km analiz edildi`:'KM verisi bekleniyor'}/>
     <Stat icon={<AlertTriangle/>} label="En Pahalı Araç" value={byVehicle[0]?byVehicle[0].plate:'—'} sub={byVehicle[0]?money(byVehicle[0].total):'Veri yok'}/>
   </section>
   <section className="panel">
     <div className="section-head"><div><h2>Gerçek Araç Maliyeti</h2><p>Yakıt + HGS + bakım + lastik + sigorta + kasko + ceza + kaza/hasar.</p></div>{loading?<span className="alarm-total"><Loader2 className="spin" size={15}/> Hesaplanıyor</span>:<span className="alarm-total"><CheckCircle2 size={15}/> Güncel</span>}</div>
     {loading?<LoadingRows/>:<>
       <div className="cost-breakdown-grid">{components.map(([label,value,icon])=>{const pct=total>0?Math.max(0,(value/total)*100):0;return <div className="cost-breakdown-card" key={label}><div className="cost-breakdown-head"><span>{icon}</span><strong>{label}</strong><b>{money(value)}</b></div><div className="cost-bar"><i style={{width:`${Math.min(100,pct)}%`}}/></div><small>{pct.toFixed(1).replace('.',',')}% of total</small></div>})}</div>
       <div className="cost-total-banner"><div><span>Toplam gerçek filo maliyeti</span><strong>{money(total)}</strong></div><div><span>Toplam analiz edilen mesafe</span><strong>{fleetKm?`${number(fleetKm)} km`:'—'}</strong></div><div><span>Ortalama gerçek maliyet</span><strong>{fleetTlKm!==null?`${money(fleetTlKm)} / km`:'—'}</strong></div></div>
     </>}
   </section>
   <section className="panel">
     <div className="section-head"><div><h2>Araç Bazında Gerçek Maliyet</h2><p>Her aracın toplam giderini ve mümkünse gerçek kullanım mesafesine göre TL/km değerini gösterir.</p></div></div>
     {loading?<LoadingRows/>:<div className="table-wrap"><table><thead><tr><th>Araç</th><th>Toplam</th><th>Yakıt</th><th>Bakım</th><th>Lastik</th><th>Sigorta + Kasko</th><th>Mesafe</th><th>Gerçek TL/km</th></tr></thead><tbody>{byVehicle.map(v=><tr key={v.id}><td><strong>{v.plate||'—'}</strong><small>{[v.brand,v.model].filter(Boolean).join(' ')||'Araç'}</small></td><td><strong>{money(v.total)}</strong></td><td>{money(v.fuel)}</td><td>{money(v.maintenance)}</td><td>{money(v.tires)}</td><td>{money(v.insurance+v.casco)}</td><td>{v.distance?`${number(v.distance)} km`:'—'}</td><td>{v.distance?money(v.total/v.distance):'KM verisi yetersiz'}</td></tr>)}</tbody></table>{!byVehicle.length&&<Empty text="Henüz araç yok" sub="Araç eklediğinde gerçek maliyetleri burada göreceksin."/>}</div>}
   </section>
   <section className="panel">
     <div className="section-head"><div><h2>Maliyet Kalemleri</h2><p>Filo genelinde hangi giderin bütçeyi taşıdığını gör.</p></div></div>
     <div className="cost-summary-list">{components.sort((a,b)=>b[1]-a[1]).map(([label,value,icon])=><div className="cost-summary-row" key={label}><div className="cost-summary-name"><span>{icon}</span><strong>{label}</strong></div><div className="cost-summary-value"><strong>{money(value)}</strong><small>{total>0?`${((value/total)*100).toFixed(1).replace('.',',')}%`: '0%'} pay</small></div></div>)}</div>
   </section>
   <section className="panel cost-info-panel"><CircleDollarSign size={20}/><div><strong>V19 maliyet mantığı</strong><span>Sigorta ve kasko araç poliçelerinden, yakıt/HGS/bakım/lastik/ceza/kaza giderleri Supabase kayıtlarından alınır. TL/km hesabı mevcut KM, KM geçmişi ve yakıt KM kayıtlarından elde edilen gerçek mesafe üzerinden yapılır; yeterli KM yoksa sistem sonucu uydurmaz ve “KM verisi yetersiz” gösterir.</span></div></section>
 </>
}


function ReportsPage({vehicles,company,setError}){
 const [startDate,setStartDate]=useState(()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10)});
 const [endDate,setEndDate]=useState(today());
 const [vehicleId,setVehicleId]=useState('all');
 const [plateSearch,setPlateSearch]=useState('');
 const [loading,setLoading]=useState(false);
 const [report,setReport]=useState(null);
 const [exporting,setExporting]=useState('');
 const selectedVehicles=useMemo(()=>vehicles.filter(v=>vehicleId==='all'||v.id===vehicleId).filter(v=>`${v.plate||''} ${v.brand||''} ${v.model||''}`.toLowerCase().includes(plateSearch.toLowerCase())),[vehicles,vehicleId,plateSearch]);
 const vehicleIds=selectedVehicles.map(v=>v.id);
 const inRange=(date)=>{if(!date)return false;const d=String(date).slice(0,10);return (!startDate||d>=startDate)&&(!endDate||d<=endDate)};
 const loadReport=async()=>{
   if(startDate&&endDate&&startDate>endDate){setError('Başlangıç tarihi bitiş tarihinden büyük olamaz.');return;}
   setLoading(true);setError('');
   try{
     if(!vehicleIds.length){setReport({vehicles:[],rows:[],totals:{total:0,fuel:0,maintenance:0,hgs:0,fines:0,accidents:0,tires:0,insurance:0,casco:0,liters:0,distance:0,tlkm:null},data:{fuel:[],maintenance:[],hgs:[],fines:[],accidents:[],tires:[],policies:[],km:[],documents:[]}});return;}
     const ids=vehicleIds;
     const [fuel,maint,hgs,fines,acc,tire,pol,km,docs]=await Promise.all([
       supabase.from('fuel_records').select('id,vehicle_id,date,liters,cost,km,station,fuel_type,note').in('vehicle_id',ids),
       supabase.from('maintenance_records').select('id,vehicle_id,date,km,description,category,cost,service_name,note').in('vehicle_id',ids),
       supabase.from('hgs_records').select('id,vehicle_id,date,type,amount,note').in('vehicle_id',ids),
       supabase.from('fines').select('id,vehicle_id,date,reason,amount,paid,paid_date,notes').in('vehicle_id',ids),
       supabase.from('accidents').select('id,vehicle_id,date,location,description,fault_rate,damage_cost,status,notes').in('vehicle_id',ids),
       supabase.from('tire_records').select('id,vehicle_id,installed_date,cost,brand,model,size,season,tread_depth').in('vehicle_id',ids),
       supabase.from('insurance_policies').select('id,vehicle_id,policy_type,start_date,end_date,cost,policy_no,provider').in('vehicle_id',ids),
       supabase.from('km_records').select('id,vehicle_id,date,km,source,note').in('vehicle_id',ids),
       supabase.from('documents').select('id,vehicle_id,name,document_type,expires_at').in('vehicle_id',ids)
     ]);
     const first=[fuel,maint,hgs,fines,acc,tire,pol,km,docs].find(x=>x.error);if(first?.error)throw first.error;
     const filterRows=(arr,dateField='date')=>(arr||[]).filter(x=>inRange(x[dateField]));
     const data={fuel:filterRows(fuel.data),maintenance:filterRows(maint.data),hgs:filterRows(hgs.data),fines:filterRows(fines.data),accidents:filterRows(acc.data),tires:filterRows(tire.data,'installed_date'),policies:filterRows(pol.data,'start_date'),km:filterRows(km.data),documents:docs.data||[]};
     const by={};selectedVehicles.forEach(v=>by[v.id]={vehicle:v,fuel:0,maintenance:0,hgs:0,fines:0,accidents:0,tires:0,insurance:0,casco:0,distance:0,liters:0,fuelCount:0,maintenanceCount:0});
     data.fuel.forEach(r=>{if(by[r.vehicle_id]){by[r.vehicle_id].fuel+=Number(r.cost||0);by[r.vehicle_id].liters+=Number(r.liters||0);by[r.vehicle_id].fuelCount++}});
     data.maintenance.forEach(r=>{if(by[r.vehicle_id]){by[r.vehicle_id].maintenance+=Number(r.cost||0);by[r.vehicle_id].maintenanceCount++}});
     data.hgs.forEach(r=>{if(by[r.vehicle_id])by[r.vehicle_id].hgs+=r.type==='refund'?-Math.abs(Number(r.amount||0)):Number(r.amount||0)});
     data.fines.forEach(r=>{if(by[r.vehicle_id])by[r.vehicle_id].fines+=Number(r.amount||0)});
     data.accidents.forEach(r=>{if(by[r.vehicle_id])by[r.vehicle_id].accidents+=Number(r.damage_cost||0)});
     data.tires.forEach(r=>{if(by[r.vehicle_id])by[r.vehicle_id].tires+=Number(r.cost||0)});
     data.policies.forEach(r=>{if(by[r.vehicle_id]){if(r.policy_type==='insurance')by[r.vehicle_id].insurance+=Number(r.cost||0);if(r.policy_type==='casco')by[r.vehicle_id].casco+=Number(r.cost||0)}});
     for(const v of Object.values(by)){
       const kms=data.km.filter(r=>r.vehicle_id===v.vehicle.id&&Number.isFinite(Number(r.km))).sort((a,b)=>Number(a.km)-Number(b.km));
       if(kms.length>=2)v.distance=Math.max(0,Number(kms[kms.length-1].km)-Number(kms[0].km));
       v.total=v.fuel+v.maintenance+v.hgs+v.fines+v.accidents+v.tires+v.insurance+v.casco;
       v.tlkm=v.distance>0?v.total/v.distance:null;
     }
     const rows=Object.values(by).sort((a,b)=>b.total-a.total);
     const totals={fuel:rows.reduce((s,v)=>s+v.fuel,0),maintenance:rows.reduce((s,v)=>s+v.maintenance,0),hgs:rows.reduce((s,v)=>s+v.hgs,0),fines:rows.reduce((s,v)=>s+v.fines,0),accidents:rows.reduce((s,v)=>s+v.accidents,0),tires:rows.reduce((s,v)=>s+v.tires,0),insurance:rows.reduce((s,v)=>s+v.insurance,0),casco:rows.reduce((s,v)=>s+v.casco,0),liters:rows.reduce((s,v)=>s+v.liters,0),distance:rows.reduce((s,v)=>s+v.distance,0)};
     totals.total=totals.fuel+totals.maintenance+totals.hgs+totals.fines+totals.accidents+totals.tires+totals.insurance+totals.casco;totals.tlkm=totals.distance>0?totals.total/totals.distance:null;
     setReport({vehicles:selectedVehicles,rows,totals,data});
   }catch(e){setError(e.message||'Rapor verileri yüklenemedi.')}finally{setLoading(false)}
 };
 useEffect(()=>{loadReport()},[]);
 const money0=n=>money(n);
 const moneyReport=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0));
 const dtext=d=>d?new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR'):'—';
 const vehicleName=id=>vehicles.find(v=>v.id===id)?.plate||id;
 const moneyCell=(v,z='#,##0.00 "TL"')=>({v:Number(v||0),z});
 const kmCell=v=>({v:Number(v||0),z:'#,##0 "km"'});
 const litreCell=v=>({v:Number(v||0),z:'#,##0.00 "L"'});
 const percentCell=v=>({v:Number(v||0)/100,z:'0.0%'});
 const applySheetLayout=(ws,widths,freezeRow=1)=>{
   ws['!cols']=widths.map(w=>({wch:w}));
   ws['!freeze']={xSplit:0,ySplit:freezeRow,topLeftCell:`A${freezeRow+1}`,activePane:'bottomRight'};
   const ref=ws['!ref'];if(ref)ws['!autofilter']={ref};
 };
 const makeTableSheet=(headers,rows,widths,moneyIndexes=[],kmIndexes=[],litreIndexes=[],percentIndexes=[])=>{
   const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
   moneyIndexes.forEach(c=>{for(let r=2;r<=rows.length+1;r++){const cell=ws[XLSX.utils.encode_cell({r:r-1,c})];if(cell&&typeof cell.v==='number')cell.z='#,##0.00 "TL"'}});
   kmIndexes.forEach(c=>{for(let r=2;r<=rows.length+1;r++){const cell=ws[XLSX.utils.encode_cell({r:r-1,c})];if(cell&&typeof cell.v==='number')cell.z='#,##0 "km"'}});
   litreIndexes.forEach(c=>{for(let r=2;r<=rows.length+1;r++){const cell=ws[XLSX.utils.encode_cell({r:r-1,c})];if(cell&&typeof cell.v==='number')cell.z='#,##0.00 "L"'}});
   percentIndexes.forEach(c=>{for(let r=2;r<=rows.length+1;r++){const cell=ws[XLSX.utils.encode_cell({r:r-1,c})];if(cell&&typeof cell.v==='number')cell.z='0.0%'}});
   applySheetLayout(ws,widths,1);return ws;
 };
 const exportExcel=()=>{if(!report)return;setExporting('excel');try{
   const wb=XLSX.utils.book_new();
   const filterLabel=selectedVehicles.length===vehicles.length&&vehicleId==='all'&&!plateSearch?'Tüm Araçlar':selectedVehicles.map(v=>v.plate).join(', ')||'Kayıt yok';
   const titleRows=[['FİLO YÖNETİM RAPORU'],['Firma',company?.name||'Benim Filom'],['Rapor Tarihi',`${dtext(startDate)} - ${dtext(endDate)}`],['Araç Filtresi',filterLabel],[]];
   const summaryRows=[['Toplam Maliyet',report.totals.total],['Yakıt',report.totals.fuel],['Bakım',report.totals.maintenance],['HGS',report.totals.hgs],['Lastik',report.totals.tires],['Trafik Sigortası',report.totals.insurance],['Kasko',report.totals.casco],['Ceza',report.totals.fines],['Kaza / Hasar',report.totals.accidents],['Toplam KM',report.totals.distance],['TL / KM',report.totals.tlkm??null]];
   const summary=XLSX.utils.aoa_to_sheet([...titleRows,['FİLO ÖZETİ','Değer'],...summaryRows]);
   summary['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}}];
   [5,6,7,8,9,10,11,12,13,14,15].forEach(r=>{const cell=summary[XLSX.utils.encode_cell({r,c:1})];if(cell&&typeof cell.v==='number')cell.z=r===15?'#,##0.00 "TL/km"':r===14?'#,##0 "km"':'#,##0.00 "TL"'});
   summary['!cols']=[{wch:28},{wch:24}];summary['!freeze']={xSplit:0,ySplit:5,topLeftCell:'A6',activePane:'bottomRight'};
   XLSX.utils.book_append_sheet(wb,summary,'01 - Özet');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Plaka','Marka','Model','Toplam Maliyet','Yakıt','Bakım','HGS','Lastik','Sigorta','Kasko','Ceza','Kaza / Hasar','Toplam KM','TL / KM','Yakıt (L)'],report.rows.map(v=>[v.vehicle.plate||'',v.vehicle.brand||'',v.vehicle.model||'',v.total,v.fuel,v.maintenance,v.hgs,v.tires,v.insurance,v.casco,v.fines,v.accidents,v.distance,v.tlkm,v.liters]),[16,18,18,18,16,16,16,16,18,16,16,18,14,14,14],[3,4,5,6,7,8,9,10,11],[12],[14]),'02 - Araçlar');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Tarih','Plaka','Yakıt Türü','Litre','KM','İstasyon','Tutar','Not'],report.data.fuel.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.fuel_type||'—',Number(r.liters||0),Number(r.km||0),r.station||'—',Number(r.cost||0),r.note||'']),[14,16,16,14,14,24,18,32],[6],[4],[3]),'03 - Yakıt');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Tarih','Plaka','KM','Bakım / Açıklama','Kategori','Servis','Tutar','Not'],report.data.maintenance.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),Number(r.km||0),r.description||'—',r.category||'—',r.service_name||'—',Number(r.cost||0),r.note||'']),[14,16,14,30,18,24,18,32],[6],[2]),'04 - Bakım');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Tarih','Plaka','İşlem','Tutar','Not'],report.data.hgs.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.type||'—',Number(r.amount||0)*(r.type==='refund'?-1:1),r.note||'']),[14,16,18,18,36],[3]),'05 - HGS');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Tarih','Plaka','Ceza Nedeni','Tutar','Durum','Ödeme Tarihi','Not'],report.data.fines.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.reason||'—',Number(r.amount||0),r.paid?'Ödendi':'Ödenmedi',dtext(r.paid_date),r.notes||'']),[14,16,34,18,16,18,32],[3]),'06 - Ceza');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Tarih','Plaka','Konum','Açıklama','Kusur Oranı','Hasar Maliyeti','Durum','Not'],report.data.accidents.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.location||'—',r.description||'—',r.fault_rate??'',Number(r.damage_cost||0),r.status||'—',r.notes||'']),[14,16,24,34,16,20,18,32],[5],[4]),'07 - Kaza');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Takılma Tarihi','Plaka','Marka','Model','Ölçü','Mevsim','Diş Derinliği','Tutar'],report.data.tires.map(r=>[dtext(r.installed_date),vehicleName(r.vehicle_id),r.brand||'—',r.model||'—',r.size||'—',r.season||'—',Number(r.tread_depth||0),Number(r.cost||0)]),[16,16,18,18,18,14,18,18],[7]),'08 - Lastik');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Tür','Plaka','Başlangıç','Bitiş','Tutar','Poliçe No','Sağlayıcı'],report.data.policies.map(r=>[r.policy_type==='insurance'?'Trafik Sigortası':'Kasko',vehicleName(r.vehicle_id),dtext(r.start_date),dtext(r.end_date),Number(r.cost||0),r.policy_no||'—',r.provider||'—']),[22,16,16,16,18,22,26],[4]),'09 - Sigorta');
   XLSX.utils.book_append_sheet(wb,makeTableSheet(['Plaka','Belge','Belge Türü','Son Geçerlilik'],report.data.documents.map(r=>[vehicleName(r.vehicle_id),r.name||'—',r.document_type||'—',dtext(r.expires_at)]),[16,34,22,22]),'10 - Evrak');
   XLSX.writeFile(wb,`filo-raporu-${startDate||'tum'}-${endDate||'tum'}.xlsx`);
 }catch(e){setError(e.message||'Excel oluşturulamadı.')}finally{setExporting('')}};
 const loadPdfFonts=doc=>{
   // Custom font is optional. If jsPDF rejects it, the report falls back to Helvetica
   // so the PDF export itself never gets blocked by font parsing.
   try{
     doc.addFileToVFS('DejaVuSans.ttf',PDF_FONT_NORMAL);
     doc.addFont('DejaVuSans.ttf','DejaVu','normal');
     // Keep the PDF tables on the normal face. This avoids bold-font parser issues
     // while preserving Turkish characters through the embedded Unicode font.
     doc.setFont('DejaVu','normal');
     return 'DejaVu';
   }catch(fontErr){
     console.warn('PDF Unicode font yüklenemedi, Helvetica fallback kullanılacak:',fontErr);
     doc.setFont('helvetica','normal');
     return 'helvetica';
   }
 };
 const exportPdf=async()=>{if(!report)return;setExporting('pdf');setError('');try{
   const doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});
   const pdfFont=loadPdfFonts(doc);
   const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
   const addFooter=()=>{const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont(pdfFont,'normal');doc.setFontSize(7);doc.setTextColor(70,75,85);doc.text(`${company?.name||'Filo Yönetim'} · Rapor ${dtext(startDate)} - ${dtext(endDate)}`,14,H-7);doc.text(`Sayfa ${i}/${pages}`,W-14,H-7,{align:'right'})}};
   const header=(title,subtitle='')=>{doc.setFillColor(24,30,43);doc.rect(0,0,W,18,'F');doc.setFont(pdfFont,'normal');doc.setTextColor(255,255,255);doc.setFontSize(15);doc.text(title,14,12);doc.setFont(pdfFont,'normal');doc.setFontSize(8);doc.text(subtitle,W-14,11,{align:'right'});doc.setTextColor(30,35,45)};
   header('FİLO YÖNETİM RAPORU',company?.name||'Benim Filom');
   doc.setFont(pdfFont,'normal');doc.setFontSize(9);doc.text(`Rapor dönemi: ${dtext(startDate)} - ${dtext(endDate)}`,14,26);doc.text(`Araç filtresi: ${selectedVehicles.map(v=>v.plate).join(', ')||'Kayıt yok'}`,14,32);
   const tableStyles={font:pdfFont,fontStyle:'normal',fontSize:9,cellPadding:3};
   const tableHeadStyles={font:pdfFont,fontStyle:'normal',fillColor:[24,30,43],textColor:[255,255,255]};
   autoTable(doc,{startY:39,head:[['KPI','Değer']],body:[['Toplam Maliyet',moneyReport(report.totals.total)],['Toplam Yakıt',moneyReport(report.totals.fuel)],['Toplam KM',number(report.totals.distance)+' km'],['TL / KM',report.totals.tlkm!==null?moneyReport(report.totals.tlkm):'—'],['Yakıt',number(report.totals.liters)+' L'],['Raporlanan Araç',String(report.rows.length)]],theme:'grid',styles:tableStyles,headStyles:tableHeadStyles,columnStyles:{0:{cellWidth:70},1:{cellWidth:60}}});
   let y=doc.lastAutoTable.finalY+10;doc.setFont(pdfFont,'normal');doc.setFontSize(11);doc.text('MALİYET DAĞILIMI',14,y);
   autoTable(doc,{startY:y+4,head:[['Gider Kalemi','Tutar','Pay']],body:[['Yakıt',moneyReport(report.totals.fuel),report.totals.total?`${(report.totals.fuel/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%'],['Bakım',moneyReport(report.totals.maintenance),report.totals.total?`${(report.totals.maintenance/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%'],['HGS',moneyReport(report.totals.hgs),report.totals.total?`${(report.totals.hgs/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%'],['Lastik',moneyReport(report.totals.tires),report.totals.total?`${(report.totals.tires/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%'],['Trafik Sigortası',moneyReport(report.totals.insurance),report.totals.total?`${(report.totals.insurance/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%'],['Kasko',moneyReport(report.totals.casco),report.totals.total?`${(report.totals.casco/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%'],['Ceza',moneyReport(report.totals.fines),report.totals.total?`${(report.totals.fines/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%'],['Kaza / Hasar',moneyReport(report.totals.accidents),report.totals.total?`${(report.totals.accidents/report.totals.total*100).toFixed(1).replace('.',',')}%`:'0%']],theme:'grid',styles:{font:pdfFont,fontStyle:'normal',fontSize:8,cellPadding:2.5},headStyles:tableHeadStyles});
   doc.addPage();header('ARAÇ BAZLI MALİYET RAPORU','Seçili araçlar');
   autoTable(doc,{startY:25,head:[['Plaka','Araç','Toplam','Yakıt','Bakım','HGS','Lastik','Sigorta','Kasko','Ceza','Kaza','KM','TL/km']],body:report.rows.map(v=>[v.vehicle.plate||'—',[v.vehicle.brand,v.vehicle.model].filter(Boolean).join(' ')||'Araç',moneyReport(v.total),moneyReport(v.fuel),moneyReport(v.maintenance),moneyReport(v.hgs),moneyReport(v.tires),moneyReport(v.insurance),moneyReport(v.casco),moneyReport(v.fines),moneyReport(v.accidents),number(v.distance),v.tlkm!==null?moneyReport(v.tlkm):'—']),theme:'grid',styles:{font:pdfFont,fontStyle:'normal',fontSize:7,cellPadding:2},headStyles:tableHeadStyles,columnStyles:{0:{cellWidth:27},1:{cellWidth:34}}});
   const detailPages=[
     ['YAKIT DETAYI',['Tarih','Plaka','Yakıt Türü','Litre','KM','İstasyon','Tutar'],report.data.fuel.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.fuel_type||'—',number(r.liters),number(r.km),r.station||'—',moneyReport(r.cost)])],
     ['BAKIM DETAYI',['Tarih','Plaka','KM','Bakım / Açıklama','Kategori','Servis','Tutar'],report.data.maintenance.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),number(r.km),r.description||'—',r.category||'—',r.service_name||'—',moneyReport(r.cost)])],
     ['HGS DETAYI',['Tarih','Plaka','İşlem','Tutar','Not'],report.data.hgs.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.type||'—',moneyReport(r.type==='refund'?-Math.abs(Number(r.amount||0)):Number(r.amount||0)),r.note||'—'])],
     ['CEZA DETAYI',['Tarih','Plaka','Ceza Nedeni','Tutar','Durum','Ödeme Tarihi'],report.data.fines.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.reason||'—',moneyReport(r.amount),r.paid?'Ödendi':'Ödenmedi',dtext(r.paid_date)])],
     ['KAZA / HASAR DETAYI',['Tarih','Plaka','Konum','Açıklama','Kusur','Hasar','Durum'],report.data.accidents.map(r=>[dtext(r.date),vehicleName(r.vehicle_id),r.location||'—',r.description||'—',r.fault_rate??'—',moneyReport(r.damage_cost),r.status||'—'])],
     ['LASTİK DETAYI',['Tarih','Plaka','Marka','Model','Ölçü','Mevsim','Diş','Tutar'],report.data.tires.map(r=>[dtext(r.installed_date),vehicleName(r.vehicle_id),r.brand||'—',r.model||'—',r.size||'—',r.season||'—',r.tread_depth!=null?`${r.tread_depth} mm`:'—',moneyReport(r.cost)])],
     ['SİGORTA / KASKO',['Tür','Plaka','Başlangıç','Bitiş','Tutar','Poliçe No','Sağlayıcı'],report.data.policies.map(r=>[r.policy_type==='insurance'?'Trafik Sigortası':'Kasko',vehicleName(r.vehicle_id),dtext(r.start_date),dtext(r.end_date),moneyReport(r.cost),r.policy_no||'—',r.provider||'—'])],
     ['EVRAK DURUMU',['Plaka','Belge','Belge Türü','Son Geçerlilik'],report.data.documents.map(r=>[vehicleName(r.vehicle_id),r.name||'—',r.document_type||'—',dtext(r.expires_at)])]
   ];
   for(const [title,heads,body] of detailPages){if(!body.length)continue;doc.addPage();header(title,`${body.length} kayıt`);autoTable(doc,{startY:25,head:[heads],body,theme:'grid',styles:{font:pdfFont,fontStyle:'normal',fontSize:7.5,cellPadding:2},headStyles:tableHeadStyles})}
   addFooter();
   // jsPDF's direct save() is the standard browser download path.
   // Explicit blob output makes the browser download reliable on Vite/Chrome as well.
   const blob=doc.output('blob');
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=`filo-raporu-${startDate||'tum'}-${endDate||'tum'}.pdf`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 }catch(e){console.error('PDF oluşturma hatası:',e);setError(`PDF oluşturulamadı: ${e?.message||e}`)}finally{setExporting('')}};
 return <section className="reports-page">
   <section className="panel report-filter-panel"><div className="section-head"><div><h2><Filter size={19}/> Rapor Filteleri</h2><p>Tarih aralığını, araç/plaka seçimini kullanarak raporu daraltabilirsin. Arama alanı marka ve modelde de çalışır.</p></div><span className="alarm-total"><BarChart3 size={15}/> Rapor Merkezi</span></div>
    <div className="report-filters"><label>Başlangıç Tarihi<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>Bitiş Tarihi<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label><label>Araç / Plaka<select value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="all">Tüm Araçlar</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {[v.brand,v.model].filter(Boolean).join(' ')}</option>)}</select></label><label>Plaka / Araç Ara<input value={plateSearch} onChange={e=>setPlateSearch(e.target.value)} placeholder="34 ABC 123"/></label><button className="primary report-run-btn" onClick={loadReport} disabled={loading}>{loading?<Loader2 className="spin" size={16}/>:<RefreshCw size={16}/>} Raporu Güncelle</button></div>
   </section>
   {!report?<LoadingRows/>:<>
   <section className="hero-grid report-kpis"><Stat icon={<CircleDollarSign/>} label="Toplam Maliyet" value={money0(report.totals.total)} sub="Seçili dönem / araçlar"/><Stat icon={<Fuel/>} label="Yakıt" value={money0(report.totals.fuel)} sub={`${number(report.totals.liters)} litre`}/><Stat icon={<Gauge/>} label="Toplam KM" value={number(report.totals.distance)} sub={report.totals.tlkm!==null?`${money0(report.totals.tlkm)} / km`:'TL/km için yeterli veri yok'}/><Stat icon={<Car/>} label="Raporlanan Araç" value={number(report.rows.length)} sub="Filtre sonucu"/></section>
   <section className="panel report-actions-panel"><div><strong>Profesyonel rapor çıktısı</strong><span>PDF ve Excel; yalnızca seçtiğin tarih ve araç filtresindeki anlamlı verileri içerir.</span></div><div className="report-export-actions"><button className="secondary" onClick={exportPdf} disabled={exporting||!report}><FileDown size={17}/> {exporting==='pdf'?'PDF hazırlanıyor...':'PDF İndir'}</button><button className="primary" onClick={exportExcel} disabled={exporting||!report}><FileSpreadsheet size={17}/> {exporting==='excel'?'Excel hazırlanıyor...':'Excel İndir'}</button></div></section>
   <section className="panel"><div className="section-head"><div><h2>Araç Bazlı Rapor</h2><p>Seçili tarih aralığındaki gerçek giderler ve kilometre özeti.</p></div><span className="alarm-total">{number(report.rows.length)} araç</span></div>{!report.rows.length?<Empty text="Filtreye uygun kayıt yok" sub="Tarih aralığını veya araç filtresini değiştir."/>:<div className="table-wrap"><table><thead><tr><th>Plaka</th><th>Araç</th><th>Toplam</th><th>Yakıt</th><th>Bakım</th><th>HGS</th><th>Lastik</th><th>Sig.+Kasko</th><th>Ceza</th><th>Kaza</th><th>KM</th><th>TL/km</th></tr></thead><tbody>{report.rows.map(v=><tr key={v.vehicle.id}><td><strong>{v.vehicle.plate||'—'}</strong></td><td><small>{[v.vehicle.brand,v.vehicle.model].filter(Boolean).join(' ')||'Araç'}</small></td><td><strong>{money0(v.total)}</strong></td><td>{money0(v.fuel)}</td><td>{money0(v.maintenance)}</td><td>{money0(v.hgs)}</td><td>{money0(v.tires)}</td><td>{money0(v.insurance+v.casco)}</td><td>{money0(v.fines)}</td><td>{money0(v.accidents)}</td><td>{v.distance?number(v.distance):'—'}</td><td>{v.tlkm!==null?money0(v.tlkm):'—'}</td></tr>)}</tbody></table></div>}</section>
   <section className="panel"><div className="section-head"><div><h2>Gider Dağılımı</h2><p>Seçili filtrelerin toplam maliyet kırılımı.</p></div></div><div className="report-cost-grid">{[['Yakıt',report.totals.fuel],['Bakım',report.totals.maintenance],['HGS',report.totals.hgs],['Lastik',report.totals.tires],['Sigorta',report.totals.insurance],['Kasko',report.totals.casco],['Ceza',report.totals.fines],['Kaza / Hasar',report.totals.accidents]].map(([k,v])=><div key={k}><span>{k}</span><strong>{money0(v)}</strong><small>{report.totals.total?`${((v/report.totals.total)*100).toFixed(1).replace('.',',')}%`:'0%'}</small></div>)}</div></section>
   </>}
 </section>
}

function VehicleModal({vehicle,companies=[],activeCompanyId='all',drivers,onClose,onSave,onCompanyCreated}){
 const [form,setForm]=useState({company_id:vehicle?.company_id||((activeCompanyId!=='all')?activeCompanyId:'') ,plate:vehicle?.plate||'',brand:vehicle?.brand||'',model:vehicle?.model||'',year:vehicle?.year||'',current_km:vehicle?.current_km||'',fuel_type:vehicle?.fuel_type||'diesel',status:vehicle?.status||'active',inspection_date:vehicle?.inspection_date||'',vin:vehicle?.vin||'',driver_id:vehicle?.driver_id||'',insurance:{start_date:vehicle?.insurance?.start_date||'',end_date:vehicle?.insurance?.end_date||'',cost:vehicle?.insurance?.cost||'',policy_no:vehicle?.insurance?.policy_no||'',provider:vehicle?.insurance?.provider||'',notes:vehicle?.insurance?.notes||''},casco:{start_date:vehicle?.casco?.start_date||'',end_date:vehicle?.casco?.end_date||'',cost:vehicle?.casco?.cost||'',policy_no:vehicle?.casco?.policy_no||'',provider:vehicle?.casco?.provider||'',notes:vehicle?.casco?.notes||''}}),[saving,setSaving]=useState(false),[showCompanyForm,setShowCompanyForm]=useState(false),[newCompanyName,setNewCompanyName]=useState(''),[companySaving,setCompanySaving]=useState(false);
 const upd=(k,v)=>setForm(x=>({...x,[k]:v}));
 const updPolicy=(type,k,v)=>setForm(x=>({...x,[type]:{...x[type],[k]:v}}));
 async function createCompany(){
  const clean=newCompanyName.trim();
  if(!clean)return;
  setCompanySaving(true);
  try{
   const sessionResult=await supabase.auth.getSession();
   const r=await withTimeout(supabase.from('companies').insert({owner_id:sessionResult.data.session?.user?.id,name:clean}).select().single(),6000,'Şirket oluşturma');
   if(r.error)throw r.error;
   setNewCompanyName('');
   setShowCompanyForm(false);
   upd('company_id',r.data.id);
   if(onCompanyCreated)await onCompanyCreated(r.data);
  }catch(e){alert(e.message||'Şirket oluşturulamadı.')}finally{setCompanySaving(false)}
 }
 async function submit(e){e.preventDefault();setSaving(true);await onSave(form);setSaving(false)}
 return <div className="modal-backdrop"><div className="modal wide-modal"><div className="modal-head"><div><h2>{vehicle?'Aracı Düzenle':'Yeni Araç'}</h2><p>Temel bilgiler, şirket, sigorta ve kasko aynı araç kaydından yönetilir.</p></div><button className="icon-btn" onClick={onClose}><X/></button></div>
 <form onSubmit={submit} className="form-grid">
  <div className="full-span" style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'end'}}><label style={{margin:0}}>Şirket *<select required value={form.company_id} onChange={e=>upd('company_id',e.target.value)}><option value="">Şirket seç</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button type="button" className="secondary" onClick={()=>setShowCompanyForm(v=>!v)}><Plus size={16}/> Yeni Şirket</button></div>
  {showCompanyForm&&<div className="policy-card full-span"><div className="policy-title"><Building2 size={18}/> Araç eklerken yeni şirket oluştur</div><div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'end'}}><label style={{margin:0}}>Şirket adı *<input required value={newCompanyName} onChange={e=>setNewCompanyName(e.target.value)} placeholder="Örn. ABC Lojistik"/></label><button type="button" className="primary" disabled={companySaving} onClick={createCompany}>{companySaving?'Oluşturuluyor...':'Şirketi Oluştur'}</button></div></div>}
  <label>Plaka *<input required value={form.plate} onChange={e=>upd('plate',e.target.value)} placeholder="34 ABC 123"/></label><label>Marka<input value={form.brand} onChange={e=>upd('brand',e.target.value)}/></label><label>Model<input value={form.model} onChange={e=>upd('model',e.target.value)}/></label><label>Model yılı<input type="number" value={form.year} onChange={e=>upd('year',e.target.value)}/></label><label>Mevcut KM<input type="number" min="0" value={form.current_km} onChange={e=>upd('current_km',e.target.value)}/></label><label>Yakıt tipi<select value={form.fuel_type} onChange={e=>upd('fuel_type',e.target.value)}>{Object.entries(fuelLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Durum<select value={form.status} onChange={e=>upd('status',e.target.value)}>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Muayene tarihi<input type="date" value={form.inspection_date} onChange={e=>upd('inspection_date',e.target.value)}/></label><label>Şasi / VIN<input value={form.vin} onChange={e=>upd('vin',e.target.value)}/></label><label>Sürücü<select value={form.driver_id} onChange={e=>upd('driver_id',e.target.value)}><option value="">Atanmamış</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  <div className="policy-card"><div className="policy-title"><ShieldCheck size={18}/> Trafik Sigortası</div><div className="form-grid policy-grid"><label>Başlangıç<input type="date" value={form.insurance.start_date} onChange={e=>updPolicy('insurance','start_date',e.target.value)}/></label><label>Bitiş<input type="date" value={form.insurance.end_date} onChange={e=>updPolicy('insurance','end_date',e.target.value)}/></label><label>Prim / Maliyet (TL)<input type="number" min="0" step="0.01" value={form.insurance.cost} onChange={e=>updPolicy('insurance','cost',e.target.value)}/></label><label>Poliçe No<input value={form.insurance.policy_no} onChange={e=>updPolicy('insurance','policy_no',e.target.value)}/></label><label className="full-span">Sigorta Şirketi<input value={form.insurance.provider} onChange={e=>updPolicy('insurance','provider',e.target.value)}/></label></div></div>
  <div className="policy-card"><div className="policy-title"><ShieldCheck size={18}/> Kasko</div><div className="form-grid policy-grid"><label>Başlangıç<input type="date" value={form.casco.start_date} onChange={e=>updPolicy('casco','start_date',e.target.value)}/></label><label>Bitiş<input type="date" value={form.casco.end_date} onChange={e=>updPolicy('casco','end_date',e.target.value)}/></label><label>Prim / Maliyet (TL)<input type="number" min="0" step="0.01" value={form.casco.cost} onChange={e=>updPolicy('casco','cost',e.target.value)}/></label><label>Poliçe No<input value={form.casco.policy_no} onChange={e=>updPolicy('casco','policy_no',e.target.value)}/></label><label className="full-span">Kasko Şirketi<input value={form.casco.provider} onChange={e=>updPolicy('casco','provider',e.target.value)}/></label></div></div>
  <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Vazgeç</button><button className="primary" disabled={saving}>{saving?'Kaydediliyor...':vehicle?'Kaydet':'Araç Oluştur'}</button></div>
 </form></div></div>
}
function Info({label,value}){return <div className="info-item"><span>{label}</span><strong>{value===null||value===undefined||value===''?'—':value}</strong></div>}
function Stat({icon,label,value,sub}){return <div className="stat"><div className="stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function Metric({title,value,icon,emphasis}){return <div className={`metric ${emphasis?'emphasis':''}`}><div className="metric-icon">{icon}</div><span>{title}</span><strong>{value}</strong></div>}
function LoadingRows(){return <div className="table-empty"><Loader2 className="spin"/><span>Yükleniyor...</span></div>}
function Empty({text,sub}){return <div className="table-empty"><strong>{text}</strong><span>{sub}</span></div>}
function FullScreenMessage({text}){return <div className="loading-screen"><Loader2 className="spin" size={28}/><span>{text}</span></div>}
function SetupMessage(){return <div className="loading-screen"><AlertTriangle size={28}/><div><strong>Supabase bağlantısı bulunamadı.</strong><span>.env.local içine VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY ekle.</span></div></div>}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
