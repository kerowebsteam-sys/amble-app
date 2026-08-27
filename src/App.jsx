import React, { useState, useEffect, useMemo } from 'react';
import { Home, DollarSign, ClipboardList, Calendar, Plus, Trash2, TrendingUp, AlertTriangle, X, Key, FileText, Upload, Link as LinkIcon, Wallet, Users, LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';

const COLORS = {
  teal: '#0F6E56',
  charcoal: '#2C2C2A',
  sand: '#E8DDC8',
  terracotta: '#C1652F',
  offwhite: '#FAF8F3',
  warmgray: '#8B8880',
};

const SEASON = (month) => {
  if ([10, 11, 0, 1, 2].includes(month)) return { label: 'Peak', mult: 1.3 };
  if ([3, 9].includes(month)) return { label: 'Shoulder', mult: 1.0 };
  return { label: 'Off-peak', mult: 0.75 };
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const STAGES = ['new', 'contacted', 'negotiating', 'won', 'lost'];
const STAGE_LABELS = { new: 'New', contacted: 'Contacted', negotiating: 'Negotiating', won: 'Won', lost: 'Lost' };

function calcPricing(property, comps, monthIdx) {
  const relevant = comps.filter(c => (c.suburb || '').toLowerCase() === (property.suburb || '').toLowerCase()
    && Math.abs(Number(c.bedrooms) - Number(property.bedrooms)) <= 1);
  const avgComp = relevant.length ? relevant.reduce((s, c) => s + Number(c.price), 0) / relevant.length : null;
  const season = SEASON(monthIdx);
  const base = avgComp || Number(property.current_rate) || 0;
  const optimal = Math.round(base * season.mult);
  const min = Math.round(optimal * 0.85);
  const max = Math.round(optimal * 1.2);
  let occupancy = 65;
  if (avgComp) {
    const diff = (avgComp - optimal) / avgComp;
    occupancy = Math.min(85, Math.max(30, 65 + diff * 40));
  }
  const revenue = Math.round(optimal * 30 * (occupancy / 100));
  const commission = Math.round(revenue * 0.2);
  return { min, optimal, max, avgComp, compCount: relevant.length, season, occupancy, revenue, commission };
}

function scoreListing(s) {
  const photo = (s.photo_count || 0) >= 20 ? 25 : (s.photo_count || 0) >= 10 ? 18 : (s.photo_count || 0) >= 5 ? 10 : 0;
  const title = s.title_optimized ? 20 : 5;
  const amenity = Math.min(20, (s.amenity_count || 0) * 2);
  const instant = s.instant_book ? 15 : 0;
  const response = s.response_under_hour ? 20 : s.response_under_day ? 10 : 0;
  return { photo, title, amenity, instant, response, total: photo + title + amenity + instant + response };
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'properties', label: 'Properties', icon: ClipboardList },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'listing', label: 'Listing score', icon: TrendingUp },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'sales', label: 'Sales pipeline', icon: Users },
];

export default function AmbleApp() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [tab, setTab] = useState('dashboard');
  const [properties, setProperties] = useState([]);
  const [comps, setComps] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [scores, setScores] = useState({});
  const [documents, setDocuments] = useState([]);
  const [financeEntries, setFinanceEntries] = useState([]);
  const [leads, setLeads] = useState([]);
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [toast, setToast] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session]);

  async function loadAll() {
    const uid = session.user.id;
    const [p, c, b, s, d, f, l] = await Promise.all([
      supabase.from('properties').select('*').order('created_at'),
      supabase.from('comps').select('*'),
      supabase.from('bookings').select('*'),
      supabase.from('listing_scores').select('*'),
      supabase.from('documents').select('*').order('added_at', { ascending: false }),
      supabase.from('finance_entries').select('*').order('entry_date', { ascending: false }),
      supabase.from('sales_leads').select('*').order('created_at', { ascending: false }),
    ]);
    setProperties(p.data || []);
    setComps(c.data || []);
    setBookings(b.data || []);
    const scoreMap = {};
    (s.data || []).forEach(row => { scoreMap[row.property_id] = row; });
    setScores(scoreMap);
    setDocuments(d.data || []);
    setFinanceEntries(f.data || []);
    setLeads(l.data || []);
    setDataLoaded(true);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  const pricingByProperty = useMemo(() => {
    const map = {};
    properties.forEach(p => { map[p.id] = calcPricing(p, comps, monthIdx); });
    return map;
  }, [properties, comps, monthIdx]);

  if (session === undefined) {
    return <div style={{ minHeight: '100vh', background: COLORS.offwhite }} />;
  }
  if (!session) {
    return <AuthScreen />;
  }

  const userId = session.user.id;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: COLORS.offwhite, minHeight: '100vh', color: COLORS.charcoal }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        .amble-display { font-family: 'Fraunces', serif; }
        .amble-nav-btn { transition: all 0.15s ease; }
      `}</style>

      <div className="flex min-h-screen">
        <div className="w-56 shrink-0 flex flex-col" style={{ background: COLORS.charcoal }}>
          <div className="flex items-center gap-2 px-5 py-6">
            <Key size={20} color={COLORS.sand} />
            <div>
              <div className="amble-display text-lg leading-none" style={{ color: COLORS.offwhite }}>Amble</div>
              <div className="text-[10px] tracking-widest" style={{ color: COLORS.warmgray }}>PROPERTY GROUP</div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            {NAV.map(item => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button key={item.id} onClick={() => setTab(item.id)}
                  className="amble-nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left"
                  style={{ background: active ? COLORS.teal : 'transparent', color: active ? COLORS.offwhite : COLORS.warmgray }}>
                  <Icon size={16} />{item.label}
                </button>
              );
            })}
          </nav>
          <div className="px-5 py-4">
            <div className="text-[11px] mb-2 truncate" style={{ color: COLORS.warmgray }}>{session.user.email}</div>
            <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 text-xs" style={{ color: COLORS.warmgray }}>
              <LogOut size={13} /> Log out
            </button>
          </div>
        </div>

        <div className="flex-1 p-8 max-w-5xl">
          {!dataLoaded ? (
            <p className="text-sm" style={{ color: COLORS.warmgray }}>Loading your data…</p>
          ) : (
            <>
              {tab === 'dashboard' && <Dashboard properties={properties} pricingByProperty={pricingByProperty} monthIdx={monthIdx} setMonthIdx={setMonthIdx} />}
              {tab === 'properties' && <Properties properties={properties} setProperties={setProperties} userId={userId} showToast={showToast} />}
              {tab === 'documents' && <Documents properties={properties} documents={documents} setDocuments={setDocuments} userId={userId} showToast={showToast} />}
              {tab === 'pricing' && <Pricing properties={properties} comps={comps} setComps={setComps} monthIdx={monthIdx} setMonthIdx={setMonthIdx} pricingByProperty={pricingByProperty} userId={userId} showToast={showToast} />}
              {tab === 'bookings' && <Bookings properties={properties} bookings={bookings} setBookings={setBookings} userId={userId} showToast={showToast} />}
              {tab === 'listing' && <ListingScore properties={properties} scores={scores} setScores={setScores} userId={userId} showToast={showToast} />}
              {tab === 'finance' && <Finance properties={properties} financeEntries={financeEntries} setFinanceEntries={setFinanceEntries} userId={userId} showToast={showToast} />}
              {tab === 'sales' && <SalesPipeline leads={leads} setLeads={setLeads} userId={userId} showToast={showToast} />}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-md text-sm shadow-lg" style={{ background: COLORS.teal, color: COLORS.offwhite }}>{toast}</div>
      )}
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(''); setBusy(true);
    const { error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else if (mode === 'signup') setError('Check your email to confirm your account, then log in.');
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: COLORS.offwhite, minHeight: '100vh' }} className="flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&display=swap'); .amble-display { font-family: 'Fraunces', serif; }`}</style>
      <div className="w-full max-w-sm p-8 rounded-lg" style={{ background: '#fff', border: `1px solid ${COLORS.sand}` }}>
        <div className="flex items-center gap-2 mb-6">
          <Key size={20} color={COLORS.teal} />
          <div className="amble-display text-xl" style={{ color: COLORS.charcoal }}>Amble</div>
        </div>
        <h2 className="text-sm font-medium mb-4">{mode === 'signin' ? 'Log in' : 'Create your account'}</h2>
        <div className="space-y-3">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          {error && <p className="text-xs" style={{ color: COLORS.terracotta }}>{error}</p>}
          <button disabled={busy} onClick={submit} className="w-full text-sm py-2 rounded-md" style={{ background: COLORS.teal, color: COLORS.offwhite }}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
        </div>
        <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-xs mt-4" style={{ color: COLORS.warmgray }}>
          {mode === 'signin' ? "No account yet? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}

function Card({ children, className = '' }) {
  return <div className={`rounded-lg p-5 ${className}`} style={{ background: '#FFFFFF', border: `1px solid ${COLORS.sand}` }}>{children}</div>;
}
function Field({ label, children }) {
  return <div><label className="text-xs block mb-1" style={{ color: COLORS.warmgray }}>{label}</label>{children}</div>;
}

function Dashboard({ properties, pricingByProperty, monthIdx, setMonthIdx }) {
  const totalRevenue = properties.reduce((s, p) => s + (pricingByProperty[p.id]?.revenue || 0), 0);
  const totalCommission = properties.reduce((s, p) => s + (pricingByProperty[p.id]?.commission || 0), 0);
  const avgOcc = properties.length ? properties.reduce((s, p) => s + (pricingByProperty[p.id]?.occupancy || 0), 0) / properties.length : 0;
  const flagged = properties.filter(p => (pricingByProperty[p.id]?.occupancy || 0) < 60);

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="amble-display text-3xl">Portfolio overview</h1>
          <p className="text-sm mt-1" style={{ color: COLORS.warmgray }}>{MONTHS[monthIdx]} forecast, based on {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
      </div>

      {properties.length === 0 ? (
        <Card><p className="text-sm" style={{ color: COLORS.warmgray }}>No properties yet. Add your first property to see forecasts here.</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Properties" value={properties.length} />
            <StatCard label="Avg. projected occupancy" value={`${avgOcc.toFixed(0)}%`} />
            <StatCard label="Projected revenue" value={`R${totalRevenue.toLocaleString()}`} accent />
            <StatCard label="Projected commission" value={`R${totalCommission.toLocaleString()}`} />
          </div>
          {flagged.length > 0 && (
            <Card className="mb-6">
              <div className="flex items-center gap-2 mb-3"><AlertTriangle size={16} color={COLORS.terracotta} /><h3 className="text-sm font-medium">Underperforming vs. target occupancy (65%)</h3></div>
              <div className="space-y-2">{flagged.map(p => (
                <div key={p.id} className="flex justify-between text-sm"><span>{p.name}</span><span style={{ color: COLORS.terracotta }}>{(pricingByProperty[p.id]?.occupancy || 0).toFixed(0)}% projected</span></div>
              ))}</div>
            </Card>
          )}
          <Card>
            <h3 className="text-sm font-medium mb-3">All properties</h3>
            <div className="space-y-3">{properties.map(p => {
              const pr = pricingByProperty[p.id];
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.sand }}>
                  <div><div className="text-sm font-medium">{p.name}</div><div className="text-xs" style={{ color: COLORS.warmgray }}>{p.suburb} · {p.bedrooms} bed</div></div>
                  <div className="text-right"><div className="amble-display text-lg" style={{ color: COLORS.teal }}>R{pr?.optimal ?? '–'}/night</div><div className="text-xs" style={{ color: COLORS.warmgray }}>{pr?.occupancy.toFixed(0)}% occ · R{pr?.revenue?.toLocaleString()} rev</div></div>
                </div>
              );
            })}</div>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return <Card><div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>{label}</div><div className="amble-display text-2xl" style={{ color: accent ? COLORS.terracotta : COLORS.charcoal }}>{value}</div></Card>;
}

function Properties({ properties, setProperties, userId, showToast }) {
  const empty = { name: '', suburb: '', bedrooms: 1, bathrooms: 1, max_guests: 2, cleaning_fee: '', current_rate: '', listing_url: '' };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  async function save() {
    if (!form.name || !form.suburb) { showToast('Name and suburb are required'); return; }
    if (editingId) {
      const { data, error } = await supabase.from('properties').update(form).eq('id', editingId).select().single();
      if (error) { showToast('Error saving'); return; }
      setProperties(properties.map(p => p.id === editingId ? data : p));
      showToast('Property updated');
    } else {
      const { data, error } = await supabase.from('properties').insert({ ...form, user_id: userId }).select().single();
      if (error) { showToast('Error adding'); return; }
      setProperties([...properties, data]);
      showToast('Property added');
    }
    setForm(empty); setEditingId(null);
  }
  function edit(p) { setForm(p); setEditingId(p.id); }
  async function remove(id) {
    await supabase.from('properties').delete().eq('id', id);
    setProperties(properties.filter(p => p.id !== id));
    if (editingId === id) { setForm(empty); setEditingId(null); }
  }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Properties</h1>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm font-medium mb-4">{editingId ? 'Edit property' : 'Add a property'}</h3>
          <div className="space-y-3">
            <Field label="Name"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} placeholder="e.g. Sea Point Loft" /></Field>
            <Field label="Suburb"><input value={form.suburb} onChange={e => setForm({ ...form, suburb: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} placeholder="e.g. Sea Point" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Bedrooms"><input type="number" min="0" value={form.bedrooms} onChange={e => setForm({ ...form, bedrooms: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} /></Field>
              <Field label="Bathrooms"><input type="number" min="0" value={form.bathrooms} onChange={e => setForm({ ...form, bathrooms: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} /></Field>
              <Field label="Max guests"><input type="number" min="1" value={form.max_guests} onChange={e => setForm({ ...form, max_guests: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cleaning fee (R)"><input type="number" min="0" value={form.cleaning_fee} onChange={e => setForm({ ...form, cleaning_fee: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} /></Field>
              <Field label="Current nightly rate (R)"><input type="number" min="0" value={form.current_rate} onChange={e => setForm({ ...form, current_rate: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} /></Field>
            </div>
            <Field label="Listing URL (reference only)"><input value={form.listing_url} onChange={e => setForm({ ...form, listing_url: e.target.value })} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} placeholder="https://..." /></Field>
            <div className="flex gap-2 pt-2">
              <button onClick={save} className="flex-1 text-sm py-2 rounded-md" style={{ background: COLORS.teal, color: COLORS.offwhite }}>{editingId ? 'Save changes' : 'Add property'}</button>
              {editingId && <button onClick={() => { setForm(empty); setEditingId(null); }} className="text-sm px-4 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}>Cancel</button>}
            </div>
          </div>
        </Card>
        <div className="space-y-3">
          {properties.length === 0 && <Card><p className="text-sm" style={{ color: COLORS.warmgray }}>No properties yet.</p></Card>}
          {properties.map(p => (
            <Card key={p.id}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: COLORS.warmgray }}>{p.suburb} · {p.bedrooms} bed / {p.bathrooms} bath · sleeps {p.max_guests}</div>
                  <div className="text-xs mt-1" style={{ color: COLORS.warmgray }}>Current rate: R{p.current_rate || '–'}/night</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(p)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: COLORS.sand }}>Edit</button>
                  <button onClick={() => remove(p.id)} className="text-xs px-2 py-1 rounded" style={{ color: COLORS.terracotta }}><Trash2 size={14} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pricing({ properties, comps, setComps, monthIdx, setMonthIdx, pricingByProperty, userId, showToast }) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id || '');
  const [compForm, setCompForm] = useState({ suburb: '', bedrooms: 1, price: '' });
  useEffect(() => { if (!selectedId && properties.length) setSelectedId(properties[0].id); }, [properties]);

  const property = properties.find(p => p.id === selectedId);
  const pricing = property ? pricingByProperty[property.id] : null;
  const relevantComps = property ? comps.filter(c => (c.suburb || '').toLowerCase() === property.suburb.toLowerCase()) : [];

  async function addComp() {
    if (!compForm.suburb || !compForm.price) { showToast('Suburb and price required'); return; }
    const { data, error } = await supabase.from('comps').insert({ ...compForm, source: 'manual', user_id: userId }).select().single();
    if (error) { showToast('Error adding comp'); return; }
    setComps([...comps, data]);
    setCompForm({ suburb: property?.suburb || '', bedrooms: 1, price: '' });
    showToast('Comp added');
  }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Pricing recommendations</h1>
      <div className="flex gap-3 mb-6">
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}>
          {properties.length === 0 && <option>No properties yet</option>}
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
      </div>
      {!property ? (
        <Card><p className="text-sm" style={{ color: COLORS.warmgray }}>Add a property first.</p></Card>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card><div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>Minimum</div><div className="amble-display text-2xl">R{pricing.min}</div></Card>
          <Card><div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>Optimal ({pricing.season.label})</div><div className="amble-display text-2xl" style={{ color: COLORS.teal }}>R{pricing.optimal}</div></Card>
          <Card><div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>Maximum</div><div className="amble-display text-2xl">R{pricing.max}</div></Card>
        </div>
      )}
      {property && (
        <Card className="mb-6">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span style={{ color: COLORS.warmgray }}>Comps used: </span>{pricing.compCount} in {property.suburb}</div>
            <div><span style={{ color: COLORS.warmgray }}>Projected occupancy: </span>{pricing.occupancy.toFixed(0)}%</div>
            <div><span style={{ color: COLORS.warmgray }}>Projected monthly revenue: </span>R{pricing.revenue.toLocaleString()}</div>
          </div>
        </Card>
      )}
      <Card>
        <h3 className="text-sm font-medium mb-3">Market comps for {property?.suburb || 'this area'}</h3>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <input placeholder="Suburb" value={compForm.suburb} onChange={e => setCompForm({ ...compForm, suburb: e.target.value })} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input type="number" placeholder="Bedrooms" value={compForm.bedrooms} onChange={e => setCompForm({ ...compForm, bedrooms: e.target.value })} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input type="number" placeholder="Price/night (R)" value={compForm.price} onChange={e => setCompForm({ ...compForm, price: e.target.value })} className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <button onClick={addComp} className="text-sm rounded-md flex items-center justify-center gap-1" style={{ background: COLORS.teal, color: COLORS.offwhite }}><Plus size={14} />Add comp</button>
        </div>
        <div className="space-y-1">
          {relevantComps.map(c => (<div key={c.id} className="flex justify-between text-sm py-1.5 border-b last:border-0" style={{ borderColor: COLORS.sand }}><span>{c.suburb} · {c.bedrooms} bed</span><span>R{c.price}/night</span></div>))}
          {relevantComps.length === 0 && <p className="text-xs" style={{ color: COLORS.warmgray }}>No comps logged yet for this suburb.</p>}
        </div>
      </Card>
    </div>
  );
}

function Bookings({ properties, bookings, setBookings, userId, showToast }) {
  const [form, setForm] = useState({ property_id: '', check_in: '', check_out: '', rate: '', platform: 'Airbnb' });
  useEffect(() => { if (!form.property_id && properties.length) setForm(f => ({ ...f, property_id: properties[0].id })); }, [properties]);

  async function addBooking() {
    if (!form.property_id || !form.check_in || !form.check_out || !form.rate) { showToast('All fields required'); return; }
    const { data, error } = await supabase.from('bookings').insert({ ...form, user_id: userId }).select().single();
    if (error) { showToast('Error logging booking'); return; }
    setBookings([...bookings, data]);
    showToast('Booking logged');
    setForm({ ...form, check_in: '', check_out: '', rate: '' });
  }
  async function remove(id) { await supabase.from('bookings').delete().eq('id', id); setBookings(bookings.filter(b => b.id !== id)); }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Bookings log</h1>
      <Card className="mb-6">
        <h3 className="text-sm font-medium mb-3">Log a booking</h3>
        <div className="grid grid-cols-5 gap-2">
          <select value={form.property_id} onChange={e => setForm({ ...form, property_id: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="date" value={form.check_in} onChange={e => setForm({ ...form, check_in: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input type="date" value={form.check_out} onChange={e => setForm({ ...form, check_out: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input type="number" placeholder="Rate (R)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}><option>Airbnb</option><option>Booking.com</option><option>Direct</option></select>
        </div>
        <button onClick={addBooking} className="mt-3 text-sm px-4 py-2 rounded-md" style={{ background: COLORS.teal, color: COLORS.offwhite }}>Log booking</button>
      </Card>
      <Card>
        <h3 className="text-sm font-medium mb-3">All bookings</h3>
        <div className="space-y-1">
          {bookings.length === 0 && <p className="text-xs" style={{ color: COLORS.warmgray }}>No bookings logged yet.</p>}
          {bookings.map(b => {
            const p = properties.find(p => p.id === b.property_id);
            const nights = Math.max(1, Math.round((new Date(b.check_out) - new Date(b.check_in)) / 86400000));
            return (
              <div key={b.id} className="flex justify-between items-center text-sm py-2 border-b last:border-0" style={{ borderColor: COLORS.sand }}>
                <span>{p?.name || 'Unknown'} · {b.check_in} → {b.check_out} ({nights}n) · {b.platform}</span>
                <div className="flex items-center gap-3"><span>R{b.rate}/night</span><button onClick={() => remove(b.id)} style={{ color: COLORS.terracotta }}><X size={14} /></button></div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ListingScore({ properties, scores, setScores, userId, showToast }) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id || '');
  useEffect(() => { if (!selectedId && properties.length) setSelectedId(properties[0].id); }, [properties]);

  const current = scores[selectedId] || { photo_count: 0, title_optimized: false, amenity_count: 0, instant_book: false, response_under_hour: false, response_under_day: false };
  const result = scoreListing(current);

  async function update(field, value) {
    const next = { ...current, [field]: value, property_id: selectedId, user_id: userId };
    const { data, error } = await supabase.from('listing_scores').upsert(next, { onConflict: 'property_id' }).select().single();
    if (error) { showToast('Error saving'); return; }
    setScores({ ...scores, [selectedId]: data });
  }

  const suggestions = [];
  if (result.photo < 25) suggestions.push('Add more high-quality photos (aim for 20+).');
  if (result.title < 20) suggestions.push('Optimize the title with keywords guests search for.');
  if (result.amenity < 20) suggestions.push('List more amenities.');
  if (result.instant === 0) suggestions.push('Turn on Instant Book.');
  if (result.response < 20) suggestions.push('Get response time under 1 hour.');

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Listing quality score</h1>
      <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="text-sm px-3 py-2 rounded-md border mb-6" style={{ borderColor: COLORS.sand }}>
        {properties.length === 0 && <option>No properties yet</option>}
        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {properties.length === 0 ? (
        <Card><p className="text-sm" style={{ color: COLORS.warmgray }}>Add a property first.</p></Card>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <div className="space-y-4">
              <Field label={`Photo count (${current.photo_count || 0})`}><input type="range" min="0" max="30" value={current.photo_count || 0} onChange={e => update('photo_count', Number(e.target.value))} className="w-full" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!current.title_optimized} onChange={e => update('title_optimized', e.target.checked)} /> Title & description optimized</label>
              <Field label={`Amenities listed (${current.amenity_count || 0})`}><input type="range" min="0" max="15" value={current.amenity_count || 0} onChange={e => update('amenity_count', Number(e.target.value))} className="w-full" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!current.instant_book} onChange={e => update('instant_book', e.target.checked)} /> Instant Book enabled</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!current.response_under_hour} onChange={e => update('response_under_hour', e.target.checked)} /> Response time under 1 hour</label>
            </div>
          </Card>
          <div>
            <Card className="mb-4 text-center">
              <div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>Listing health score</div>
              <div className="amble-display text-5xl" style={{ color: result.total >= 80 ? COLORS.teal : result.total >= 50 ? COLORS.terracotta : COLORS.warmgray }}>{result.total}</div>
              <div className="text-xs" style={{ color: COLORS.warmgray }}>out of 100</div>
            </Card>
            {suggestions.length > 0 && <Card><h3 className="text-sm font-medium mb-2">Suggestions</h3><ul className="text-sm space-y-1.5">{suggestions.map((s, i) => <li key={i}>· {s}</li>)}</ul></Card>}
          </div>
        </div>
      )}
    </div>
  );
}

function Documents({ properties, documents, setDocuments, userId, showToast }) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id || '');
  const [docType, setDocType] = useState('photo');
  const [mode, setMode] = useState('upload');
  const [label, setLabel] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (!selectedId && properties.length) setSelectedId(properties[0].id); }, [properties]);

  const propDocs = documents.filter(d => d.property_id === selectedId);

  async function addDocument() {
    if (!selectedId) { showToast('Select a property first'); return; }
    if (mode === 'link') {
      if (!label) { showToast('Give this document a name'); return; }
      if (!externalUrl) { showToast('Paste a link'); return; }
      const { data, error } = await supabase.from('documents').insert({ property_id: selectedId, user_id: userId, label, doc_type: docType, storage_kind: 'link', external_url: externalUrl }).select().single();
      if (error) { showToast('Error saving'); return; }
      setDocuments([data, ...documents]); setLabel(''); setExternalUrl(''); showToast('Link saved');
    } else {
      if (pendingFiles.length === 0) { showToast('Choose at least one file'); return; }
      setUploading(true);
      const newDocs = [];
      for (const file of pendingFiles) {
        const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
        if (upErr) { showToast(`Failed: ${file.name}`); continue; }
        const docLabel = pendingFiles.length > 1 ? (label ? `${label} — ${file.name}` : file.name) : (label || file.name);
        const { data, error } = await supabase.from('documents').insert({ property_id: selectedId, user_id: userId, label: docLabel, doc_type: docType, storage_kind: 'file', file_path: path, file_name: file.name }).select().single();
        if (!error) newDocs.push(data);
      }
      setUploading(false);
      setDocuments([...newDocs, ...documents]);
      setLabel(''); setPendingFiles([]);
      showToast(newDocs.length > 1 ? `${newDocs.length} files uploaded` : 'File uploaded');
    }
  }

  async function openDoc(doc) {
    if (doc.storage_kind === 'link') { window.open(doc.external_url, '_blank'); return; }
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 3600);
    if (error) { showToast('Could not open file'); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function removeDoc(doc) {
    if (doc.storage_kind === 'file') await supabase.storage.from('documents').remove([doc.file_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    setDocuments(documents.filter(d => d.id !== doc.id));
  }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-2">Property documents</h1>
      <p className="text-sm mb-6" style={{ color: COLORS.warmgray }}>Files are stored securely in your account and follow you to any browser or device you log in from.</p>
      <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="text-sm px-3 py-2 rounded-md border mb-6" style={{ borderColor: COLORS.sand }}>
        {properties.length === 0 && <option>No properties yet</option>}
        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {properties.length === 0 ? (
        <Card><p className="text-sm" style={{ color: COLORS.warmgray }}>Add a property first.</p></Card>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-medium mb-4">Add a document</h3>
            <div className="space-y-3">
              <Field label="Type"><select value={docType} onChange={e => setDocType(e.target.value)} className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}><option value="photo">Photo</option><option value="contract">Signed contract</option><option value="id">Owner ID / FICA doc</option><option value="other">Other</option></select></Field>
              <Field label={mode === 'upload' ? 'Name / description (optional if uploading multiple)' : 'Name / description'}><input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Lease agreement 2026" className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} /></Field>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setMode('upload')} className="flex-1 py-1.5 rounded-md flex items-center justify-center gap-1" style={{ background: mode === 'upload' ? COLORS.teal : 'transparent', color: mode === 'upload' ? COLORS.offwhite : COLORS.charcoal, border: `1px solid ${COLORS.sand}` }}><Upload size={13} /> Upload file(s)</button>
                <button onClick={() => setMode('link')} className="flex-1 py-1.5 rounded-md flex items-center justify-center gap-1" style={{ background: mode === 'link' ? COLORS.teal : 'transparent', color: mode === 'link' ? COLORS.offwhite : COLORS.charcoal, border: `1px solid ${COLORS.sand}` }}><LinkIcon size={13} /> Paste a link</button>
              </div>
              {mode === 'upload' ? (
                <Field label={`File(s)${pendingFiles.length ? ` — ${pendingFiles.length} selected` : ''}`}>
                  <input type="file" multiple onChange={e => setPendingFiles(Array.from(e.target.files))} className="w-full text-sm" />
                </Field>
              ) : (<Field label="Google Drive / Dropbox link"><input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://drive.google.com/..." className="w-full text-sm px-3 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} /></Field>)}
              <button onClick={addDocument} disabled={uploading} className="w-full text-sm py-2 rounded-md" style={{ background: COLORS.teal, color: COLORS.offwhite }}>{uploading ? 'Uploading…' : 'Save document'}</button>
            </div>
          </Card>
          <div className="space-y-3">
            {propDocs.length === 0 && <Card><p className="text-sm" style={{ color: COLORS.warmgray }}>No documents for this property yet.</p></Card>}
            {propDocs.map(doc => (
              <Card key={doc.id}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <FileText size={18} color={COLORS.warmgray} />
                    <div><div className="text-sm font-medium">{doc.label}</div><div className="text-xs" style={{ color: COLORS.warmgray }}>{doc.doc_type} · {doc.storage_kind === 'link' ? 'external link' : 'stored in your account'}</div></div>
                  </div>
                  <div className="flex gap-2"><button onClick={() => openDoc(doc)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: COLORS.sand }}>Open</button><button onClick={() => removeDoc(doc)} className="text-xs px-2 py-1 rounded" style={{ color: COLORS.terracotta }}><Trash2 size={14} /></button></div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const FINANCE_CATEGORIES = ['Commission income', 'Cleaning cost', 'Marketing', 'Subscriptions/software', 'Insurance', 'Accounting', 'Owner salary draw', 'Other'];

function Finance({ properties, financeEntries, setFinanceEntries, userId, showToast }) {
  const empty = { entry_date: new Date().toISOString().slice(0, 10), entry_type: 'income', category: FINANCE_CATEGORIES[0], amount: '', property_id: '', notes: '' };
  const [form, setForm] = useState(empty);

  async function addEntry() {
    if (!form.amount) { showToast('Amount required'); return; }
    const payload = { ...form, user_id: userId, property_id: form.property_id || null, amount: Number(form.amount) };
    const { data, error } = await supabase.from('finance_entries').insert(payload).select().single();
    if (error) { showToast('Error saving'); return; }
    setFinanceEntries([data, ...financeEntries]);
    setForm(empty);
    showToast('Entry logged');
  }
  async function remove(id) { await supabase.from('finance_entries').delete().eq('id', id); setFinanceEntries(financeEntries.filter(e => e.id !== id)); }

  const now = new Date();
  const thisMonthEntries = financeEntries.filter(e => { const d = new Date(e.entry_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const income = thisMonthEntries.filter(e => e.entry_type === 'income').reduce((s, e) => s + Number(e.amount), 0);
  const expenses = thisMonthEntries.filter(e => e.entry_type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
  const salaryDrawn = thisMonthEntries.filter(e => e.category === 'Owner salary draw').reduce((s, e) => s + Number(e.amount), 0);
  const salaryPct = Math.min(100, (salaryDrawn / 35000) * 100);

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Finance tracker</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Income this month" value={`R${income.toLocaleString()}`} />
        <StatCard label="Expenses this month" value={`R${expenses.toLocaleString()}`} />
        <StatCard label="Net this month" value={`R${(income - expenses).toLocaleString()}`} accent />
      </div>
      <Card className="mb-6">
        <div className="flex justify-between text-sm mb-2"><span>Owner salary drawn this month</span><span>R{salaryDrawn.toLocaleString()} / R35,000</span></div>
        <div className="w-full h-2 rounded-full" style={{ background: COLORS.sand }}><div className="h-2 rounded-full" style={{ width: `${salaryPct}%`, background: COLORS.teal }} /></div>
      </Card>
      <Card className="mb-6">
        <h3 className="text-sm font-medium mb-3">Log an entry</h3>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <select value={form.entry_type} onChange={e => setForm({ ...form, entry_type: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}><option value="income">Income</option><option value="expense">Expense</option></select>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}>{FINANCE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          <input type="number" placeholder="Amount (R)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <select value={form.property_id} onChange={e => setForm({ ...form, property_id: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }}><option value="">No specific property</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
        </div>
        <button onClick={addEntry} className="text-sm px-4 py-2 rounded-md" style={{ background: COLORS.teal, color: COLORS.offwhite }}>Log entry</button>
      </Card>
      <Card>
        <h3 className="text-sm font-medium mb-3">All entries</h3>
        <div className="space-y-1">
          {financeEntries.length === 0 && <p className="text-xs" style={{ color: COLORS.warmgray }}>No entries yet.</p>}
          {financeEntries.map(e => (
            <div key={e.id} className="flex justify-between items-center text-sm py-2 border-b last:border-0" style={{ borderColor: COLORS.sand }}>
              <span>{e.entry_date} · {e.category}{e.notes ? ` · ${e.notes}` : ''}</span>
              <div className="flex items-center gap-3"><span style={{ color: e.entry_type === 'income' ? COLORS.teal : COLORS.terracotta }}>{e.entry_type === 'income' ? '+' : '−'}R{Number(e.amount).toLocaleString()}</span><button onClick={() => remove(e.id)} style={{ color: COLORS.terracotta }}><X size={14} /></button></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SalesPipeline({ leads, setLeads, userId, showToast }) {
  const empty = { owner_name: '', contact: '', property_area: '', stage: 'new', notes: '' };
  const [form, setForm] = useState(empty);

  async function addLead() {
    if (!form.owner_name) { showToast('Owner name required'); return; }
    const { data, error } = await supabase.from('sales_leads').insert({ ...form, user_id: userId }).select().single();
    if (error) { showToast('Error saving'); return; }
    setLeads([data, ...leads]);
    setForm(empty);
    showToast('Lead added');
  }
  async function moveStage(lead, stage) {
    const { data, error } = await supabase.from('sales_leads').update({ stage }).eq('id', lead.id).select().single();
    if (error) return;
    setLeads(leads.map(l => l.id === lead.id ? data : l));
  }
  async function remove(id) { await supabase.from('sales_leads').delete().eq('id', id); setLeads(leads.filter(l => l.id !== id)); }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Sales pipeline</h1>
      <Card className="mb-6">
        <h3 className="text-sm font-medium mb-3">Add a lead</h3>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <input placeholder="Owner name" value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input placeholder="Contact (phone/email)" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input placeholder="Property area" value={form.property_area} onChange={e => setForm({ ...form, property_area: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
          <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="text-sm px-2 py-2 rounded-md border" style={{ borderColor: COLORS.sand }} />
        </div>
        <button onClick={addLead} className="text-sm px-4 py-2 rounded-md" style={{ background: COLORS.teal, color: COLORS.offwhite }}>Add lead</button>
      </Card>
      <div className="grid grid-cols-5 gap-3">
        {STAGES.map(stage => (
          <div key={stage}>
            <div className="text-xs font-medium mb-2 px-1" style={{ color: COLORS.warmgray }}>{STAGE_LABELS[stage]} ({leads.filter(l => l.stage === stage).length})</div>
            <div className="space-y-2">
              {leads.filter(l => l.stage === stage).map(l => (
                <Card key={l.id} className="!p-3">
                  <div className="text-sm font-medium">{l.owner_name}</div>
                  {l.property_area && <div className="text-xs" style={{ color: COLORS.warmgray }}>{l.property_area}</div>}
                  {l.contact && <div className="text-xs" style={{ color: COLORS.warmgray }}>{l.contact}</div>}
                  <select value={l.stage} onChange={e => moveStage(l, e.target.value)} className="w-full text-xs mt-2 px-1 py-1 rounded border" style={{ borderColor: COLORS.sand }}>
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                  <button onClick={() => remove(l.id)} className="text-xs mt-2" style={{ color: COLORS.terracotta }}>Remove</button>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}