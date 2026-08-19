import React, { useState, useEffect, useMemo } from "react";
import {
  Home,
  DollarSign,
  ClipboardList,
  Calendar,
  Plus,
  Trash2,
  TrendingUp,
  AlertTriangle,
  X,
  Key,
  FileText,
  Upload,
  Link as LinkIcon,
  Image as ImageIcon,
} from "lucide-react";

const COLORS = {
  teal: "#0F6E56",
  tealDeep: "#0B5443",
  charcoal: "#2C2C2A",
  sand: "#E8DDC8",
  terracotta: "#C1652F",
  offwhite: "#FAF8F3",
  warmgray: "#8B8880",
};

// --- IndexedDB helpers for storing uploaded files locally in the browser ---
function openFileDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ambleFilesDB", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("files", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveFileBlob(id, blob, name, type) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put({ id, blob, name, type });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getFileBlob(id) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const req = tx.objectStore("files").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function deleteFileBlob(id) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const SEASON = (month) => {
  // Cape Town seasonality: Nov-Mar peak, Apr & Oct shoulder, May-Sep off-peak
  if ([10, 11, 0, 1, 2].includes(month)) return { label: "Peak", mult: 1.3 };
  if ([3, 9].includes(month)) return { label: "Shoulder", mult: 1.0 };
  return { label: "Off-peak", mult: 0.75 };
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function calcPricing(property, comps, monthIdx) {
  const relevant = comps.filter(
    (c) =>
      c.suburb.toLowerCase() === (property.suburb || "").toLowerCase() &&
      Math.abs(Number(c.bedrooms) - Number(property.bedrooms)) <= 1,
  );
  const avgComp = relevant.length
    ? relevant.reduce((s, c) => s + Number(c.price), 0) / relevant.length
    : null;
  const season = SEASON(monthIdx);
  const base = avgComp || Number(property.currentRate) || 0;
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
  return {
    min,
    optimal,
    max,
    avgComp,
    compCount: relevant.length,
    season,
    occupancy,
    revenue,
    commission,
  };
}

function scoreListing(s) {
  const photo =
    s.photoCount >= 20
      ? 25
      : s.photoCount >= 10
        ? 18
        : s.photoCount >= 5
          ? 10
          : 0;
  const title = s.titleOptimized ? 20 : 5;
  const amenity = Math.min(20, (s.amenityCount || 0) * 2);
  const instant = s.instantBook ? 15 : 0;
  const response = s.responseUnderHour ? 20 : s.responseUnderDay ? 10 : 0;
  return {
    photo,
    title,
    amenity,
    instant,
    response,
    total: photo + title + amenity + instant + response,
  };
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "properties", label: "Properties", icon: ClipboardList },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "pricing", label: "Pricing", icon: DollarSign },
  { id: "bookings", label: "Bookings", icon: Calendar },
  { id: "listing", label: "Listing score", icon: TrendingUp },
];

export default function AmbleApp() {
  const [tab, setTab] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [properties, setProperties] = useState([]);
  const [comps, setComps] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [scores, setScores] = useState({});
  const [documents, setDocuments] = useState([]);
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("amble-app-data");
      if (raw) {
        const d = JSON.parse(raw);
        setProperties(d.properties || []);
        setComps(d.comps || []);
        setBookings(d.bookings || []);
        setScores(d.scores || {});
        setDocuments(d.documents || []);
      }
    } catch (e) {
      /* no data yet */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const data = { properties, comps, bookings, scores, documents };
    try {
      localStorage.setItem("amble-app-data", JSON.stringify(data));
    } catch (e) {}
  }, [properties, comps, bookings, scores, documents, loaded]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  const pricingByProperty = useMemo(() => {
    const map = {};
    properties.forEach((p) => {
      map[p.id] = calcPricing(p, comps, monthIdx);
    });
    return map;
  }, [properties, comps, monthIdx]);

  return (
    <div
      style={{
        fontFamily: "Inter, sans-serif",
        background: COLORS.offwhite,
        minHeight: "100vh",
        color: COLORS.charcoal,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        .amble-display { font-family: 'Fraunces', serif; }
        .amble-nav-btn { transition: all 0.15s ease; }
        input, select { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <div
          className="w-56 shrink-0 flex flex-col"
          style={{ background: COLORS.charcoal }}
        >
          <div className="flex items-center gap-2 px-5 py-6">
            <Key size={20} color={COLORS.sand} />
            <div>
              <div
                className="amble-display text-lg leading-none"
                style={{ color: COLORS.offwhite }}
              >
                Amble
              </div>
              <div
                className="text-[10px] tracking-widest"
                style={{ color: COLORS.warmgray }}
              >
                PROPERTY GROUP
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className="amble-nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left"
                  style={{
                    background: active ? COLORS.teal : "transparent",
                    color: active ? COLORS.offwhite : COLORS.warmgray,
                  }}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div
            className="px-5 py-4 text-[11px]"
            style={{ color: COLORS.warmgray }}
          >
            Private internal tool
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-8 max-w-5xl">
          {tab === "dashboard" && (
            <Dashboard
              properties={properties}
              pricingByProperty={pricingByProperty}
              monthIdx={monthIdx}
              setMonthIdx={setMonthIdx}
            />
          )}
          {tab === "properties" && (
            <Properties
              properties={properties}
              setProperties={setProperties}
              showToast={showToast}
            />
          )}
          {tab === "documents" && (
            <Documents
              properties={properties}
              documents={documents}
              setDocuments={setDocuments}
              showToast={showToast}
            />
          )}
          {tab === "pricing" && (
            <Pricing
              properties={properties}
              comps={comps}
              setComps={setComps}
              monthIdx={monthIdx}
              setMonthIdx={setMonthIdx}
              pricingByProperty={pricingByProperty}
              showToast={showToast}
            />
          )}
          {tab === "bookings" && (
            <Bookings
              properties={properties}
              bookings={bookings}
              setBookings={setBookings}
              showToast={showToast}
            />
          )}
          {tab === "listing" && (
            <ListingScore
              properties={properties}
              scores={scores}
              setScores={setScores}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2.5 rounded-md text-sm shadow-lg"
          style={{ background: COLORS.teal, color: COLORS.offwhite }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-lg p-5 ${className}`}
      style={{ background: "#FFFFFF", border: `1px solid ${COLORS.sand}` }}
    >
      {children}
    </div>
  );
}

function Dashboard({ properties, pricingByProperty, monthIdx, setMonthIdx }) {
  const totalRevenue = properties.reduce(
    (s, p) => s + (pricingByProperty[p.id]?.revenue || 0),
    0,
  );
  const totalCommission = properties.reduce(
    (s, p) => s + (pricingByProperty[p.id]?.commission || 0),
    0,
  );
  const avgOcc = properties.length
    ? properties.reduce(
        (s, p) => s + (pricingByProperty[p.id]?.occupancy || 0),
        0,
      ) / properties.length
    : 0;
  const flagged = properties.filter(
    (p) => (pricingByProperty[p.id]?.occupancy || 0) < 60,
  );

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1
            className="amble-display text-3xl"
            style={{ color: COLORS.charcoal }}
          >
            Portfolio overview
          </h1>
          <p className="text-sm mt-1" style={{ color: COLORS.warmgray }}>
            {MONTHS[monthIdx]} forecast, based on {properties.length} propert
            {properties.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <select
          value={monthIdx}
          onChange={(e) => setMonthIdx(Number(e.target.value))}
          className="text-sm px-3 py-2 rounded-md border"
          style={{ borderColor: COLORS.sand }}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {properties.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: COLORS.warmgray }}>
            No properties yet. Add your first property to see pricing and
            revenue forecasts here.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Properties" value={properties.length} />
            <StatCard
              label="Avg. projected occupancy"
              value={`${avgOcc.toFixed(0)}%`}
            />
            <StatCard
              label="Projected revenue"
              value={`R${totalRevenue.toLocaleString()}`}
              accent
            />
            <StatCard
              label="Projected commission"
              value={`R${totalCommission.toLocaleString()}`}
            />
          </div>

          {flagged.length > 0 && (
            <Card className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} color={COLORS.terracotta} />
                <h3 className="text-sm font-medium">
                  Underperforming vs. target occupancy (65%)
                </h3>
              </div>
              <div className="space-y-2">
                {flagged.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span style={{ color: COLORS.terracotta }}>
                      {(pricingByProperty[p.id]?.occupancy || 0).toFixed(0)}%
                      projected occupancy
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-medium mb-3">All properties</h3>
            <div className="space-y-3">
              {properties.map((p) => {
                const pr = pricingByProperty[p.id];
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                    style={{ borderColor: COLORS.sand }}
                  >
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div
                        className="text-xs"
                        style={{ color: COLORS.warmgray }}
                      >
                        {p.suburb} · {p.bedrooms} bed
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="amble-display text-lg"
                        style={{ color: COLORS.teal }}
                      >
                        R{pr?.optimal ?? "–"}/night
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: COLORS.warmgray }}
                      >
                        {pr?.occupancy.toFixed(0)}% occ · R
                        {pr?.revenue?.toLocaleString()} rev
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <Card>
      <div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>
        {label}
      </div>
      <div
        className="amble-display text-2xl"
        style={{ color: accent ? COLORS.terracotta : COLORS.charcoal }}
      >
        {value}
      </div>
    </Card>
  );
}

function Properties({ properties, setProperties, showToast }) {
  const [form, setForm] = useState(emptyProperty());
  const [editingId, setEditingId] = useState(null);

  function emptyProperty() {
    return {
      id: uid(),
      name: "",
      suburb: "",
      bedrooms: 1,
      bathrooms: 1,
      maxGuests: 2,
      cleaningFee: "",
      currentRate: "",
      listingUrl: "",
    };
  }

  function save() {
    if (!form.name || !form.suburb) {
      showToast("Name and suburb are required");
      return;
    }
    if (editingId) {
      setProperties(properties.map((p) => (p.id === editingId ? form : p)));
      showToast("Property updated");
    } else {
      setProperties([...properties, form]);
      showToast("Property added");
    }
    setForm(emptyProperty());
    setEditingId(null);
  }

  function edit(p) {
    setForm(p);
    setEditingId(p.id);
  }
  function remove(id) {
    setProperties(properties.filter((p) => p.id !== id));
    if (editingId === id) {
      setForm(emptyProperty());
      setEditingId(null);
    }
  }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Properties</h1>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm font-medium mb-4">
            {editingId ? "Edit property" : "Add a property"}
          </h3>
          <div className="space-y-3">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-md border"
                style={{ borderColor: COLORS.sand }}
                placeholder="e.g. Sea Point Loft"
              />
            </Field>
            <Field label="Suburb">
              <input
                value={form.suburb}
                onChange={(e) => setForm({ ...form, suburb: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-md border"
                style={{ borderColor: COLORS.sand }}
                placeholder="e.g. Sea Point"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Bedrooms">
                <input
                  type="number"
                  min="0"
                  value={form.bedrooms}
                  onChange={(e) =>
                    setForm({ ...form, bedrooms: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                />
              </Field>
              <Field label="Bathrooms">
                <input
                  type="number"
                  min="0"
                  value={form.bathrooms}
                  onChange={(e) =>
                    setForm({ ...form, bathrooms: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                />
              </Field>
              <Field label="Max guests">
                <input
                  type="number"
                  min="1"
                  value={form.maxGuests}
                  onChange={(e) =>
                    setForm({ ...form, maxGuests: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cleaning fee (R)">
                <input
                  type="number"
                  min="0"
                  value={form.cleaningFee}
                  onChange={(e) =>
                    setForm({ ...form, cleaningFee: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                />
              </Field>
              <Field label="Current nightly rate (R)">
                <input
                  type="number"
                  min="0"
                  value={form.currentRate}
                  onChange={(e) =>
                    setForm({ ...form, currentRate: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                />
              </Field>
            </div>
            <Field label="Listing URL (reference only)">
              <input
                value={form.listingUrl}
                onChange={(e) =>
                  setForm({ ...form, listingUrl: e.target.value })
                }
                className="w-full text-sm px-3 py-2 rounded-md border"
                style={{ borderColor: COLORS.sand }}
                placeholder="https://..."
              />
            </Field>
            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                className="flex-1 text-sm py-2 rounded-md"
                style={{ background: COLORS.teal, color: COLORS.offwhite }}
              >
                {editingId ? "Save changes" : "Add property"}
              </button>
              {editingId && (
                <button
                  onClick={() => {
                    setForm(emptyProperty());
                    setEditingId(null);
                  }}
                  className="text-sm px-4 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          {properties.length === 0 && (
            <Card>
              <p className="text-sm" style={{ color: COLORS.warmgray }}>
                No properties yet.
              </p>
            </Card>
          )}
          {properties.map((p) => (
            <Card key={p.id}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: COLORS.warmgray }}
                  >
                    {p.suburb} · {p.bedrooms} bed / {p.bathrooms} bath · sleeps{" "}
                    {p.maxGuests}
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: COLORS.warmgray }}
                  >
                    Current rate: R{p.currentRate || "–"}/night
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => edit(p)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: COLORS.sand }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: COLORS.terracotta }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs block mb-1" style={{ color: COLORS.warmgray }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Documents({ properties, documents, setDocuments, showToast }) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id || "");
  const [docType, setDocType] = useState("photo");
  const [mode, setMode] = useState("upload"); // 'upload' or 'link'
  const [label, setLabel] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [thumbs, setThumbs] = useState({}); // id -> object URL

  useEffect(() => {
    if (!selectedId && properties.length) setSelectedId(properties[0].id);
  }, [properties]);

  const propDocs = documents.filter((d) => d.propertyId === selectedId);

  useEffect(() => {
    // load thumbnails for image files
    let cancelled = false;
    (async () => {
      for (const doc of propDocs) {
        if (
          doc.storage === "local" &&
          doc.fileType?.startsWith("image/") &&
          !thumbs[doc.id]
        ) {
          const rec = await getFileBlob(doc.id);
          if (rec && !cancelled) {
            const url = URL.createObjectURL(rec.blob);
            setThumbs((t) => ({ ...t, [doc.id]: url }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propDocs.length, selectedId]);

  async function addDocument() {
    if (!selectedId) {
      showToast("Select a property first");
      return;
    }
    if (!label) {
      showToast("Give this document a name");
      return;
    }
    if (mode === "link") {
      if (!externalUrl) {
        showToast("Paste a link");
        return;
      }
      setDocuments([
        ...documents,
        {
          id: uid(),
          propertyId: selectedId,
          label,
          docType,
          storage: "link",
          externalUrl,
          addedAt: new Date().toISOString(),
        },
      ]);
      setLabel("");
      setExternalUrl("");
      showToast("Link saved");
    } else {
      if (!pendingFile) {
        showToast("Choose a file");
        return;
      }
      const id = uid();
      await saveFileBlob(id, pendingFile, pendingFile.name, pendingFile.type);
      setDocuments([
        ...documents,
        {
          id,
          propertyId: selectedId,
          label,
          docType,
          storage: "local",
          fileName: pendingFile.name,
          fileType: pendingFile.type,
          addedAt: new Date().toISOString(),
        },
      ]);
      setLabel("");
      setPendingFile(null);
      showToast("File uploaded");
    }
  }

  async function openDoc(doc) {
    if (doc.storage === "link") {
      window.open(doc.externalUrl, "_blank");
      return;
    }
    const rec = await getFileBlob(doc.id);
    if (rec) {
      const url = URL.createObjectURL(rec.blob);
      window.open(url, "_blank");
    } else {
      showToast("File not found in this browser");
    }
  }

  async function removeDoc(doc) {
    if (doc.storage === "local") await deleteFileBlob(doc.id);
    setDocuments(documents.filter((d) => d.id !== doc.id));
  }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-2">Property documents</h1>
      <p className="text-sm mb-6" style={{ color: COLORS.warmgray }}>
        Uploaded files are stored only in this browser. For anything important —
        signed contracts especially — use "Paste a link" to a Google
        Drive/Dropbox file instead, so it's safely backed up off this device.
      </p>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="text-sm px-3 py-2 rounded-md border mb-6"
        style={{ borderColor: COLORS.sand }}
      >
        {properties.length === 0 && <option>No properties yet</option>}
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {properties.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: COLORS.warmgray }}>
            Add a property first.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <h3 className="text-sm font-medium mb-4">Add a document</h3>
            <div className="space-y-3">
              <Field label="Type">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                >
                  <option value="photo">Photo</option>
                  <option value="contract">Signed contract</option>
                  <option value="id">Owner ID / FICA doc</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Name / description">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Lease agreement 2026"
                  className="w-full text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: COLORS.sand }}
                />
              </Field>

              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setMode("upload")}
                  className="flex-1 py-1.5 rounded-md flex items-center justify-center gap-1"
                  style={{
                    background: mode === "upload" ? COLORS.teal : "transparent",
                    color:
                      mode === "upload" ? COLORS.offwhite : COLORS.charcoal,
                    border: `1px solid ${COLORS.sand}`,
                  }}
                >
                  <Upload size={13} /> Upload file
                </button>
                <button
                  onClick={() => setMode("link")}
                  className="flex-1 py-1.5 rounded-md flex items-center justify-center gap-1"
                  style={{
                    background: mode === "link" ? COLORS.teal : "transparent",
                    color: mode === "link" ? COLORS.offwhite : COLORS.charcoal,
                    border: `1px solid ${COLORS.sand}`,
                  }}
                >
                  <LinkIcon size={13} /> Paste a link
                </button>
              </div>

              {mode === "upload" ? (
                <Field label="File">
                  <input
                    type="file"
                    onChange={(e) => setPendingFile(e.target.files[0])}
                    className="w-full text-sm"
                  />
                </Field>
              ) : (
                <Field label="Google Drive / Dropbox link">
                  <input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full text-sm px-3 py-2 rounded-md border"
                    style={{ borderColor: COLORS.sand }}
                  />
                </Field>
              )}

              <button
                onClick={addDocument}
                className="w-full text-sm py-2 rounded-md"
                style={{ background: COLORS.teal, color: COLORS.offwhite }}
              >
                Save document
              </button>
            </div>
          </Card>

          <div className="space-y-3">
            {propDocs.length === 0 && (
              <Card>
                <p className="text-sm" style={{ color: COLORS.warmgray }}>
                  No documents for this property yet.
                </p>
              </Card>
            )}
            {propDocs.map((doc) => (
              <Card key={doc.id}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {thumbs[doc.id] ? (
                      <img
                        src={thumbs[doc.id]}
                        alt=""
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : doc.docType === "photo" ? (
                      <ImageIcon size={18} color={COLORS.warmgray} />
                    ) : (
                      <FileText size={18} color={COLORS.warmgray} />
                    )}
                    <div>
                      <div className="text-sm font-medium">{doc.label}</div>
                      <div
                        className="text-xs"
                        style={{ color: COLORS.warmgray }}
                      >
                        {doc.docType} ·{" "}
                        {doc.storage === "link"
                          ? "external link"
                          : "stored in browser"}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openDoc(doc)}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: COLORS.sand }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => removeDoc(doc)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: COLORS.terracotta }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Pricing({
  properties,
  comps,
  setComps,
  monthIdx,
  setMonthIdx,
  pricingByProperty,
  showToast,
}) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id || "");
  const [compForm, setCompForm] = useState({
    suburb: "",
    bedrooms: 1,
    price: "",
  });

  useEffect(() => {
    if (!selectedId && properties.length) setSelectedId(properties[0].id);
  }, [properties]);

  const property = properties.find((p) => p.id === selectedId);
  const pricing = property ? pricingByProperty[property.id] : null;
  const relevantComps = property
    ? comps.filter(
        (c) => c.suburb.toLowerCase() === property.suburb.toLowerCase(),
      )
    : [];

  function addComp() {
    if (!compForm.suburb || !compForm.price) {
      showToast("Suburb and price required");
      return;
    }
    setComps([
      ...comps,
      {
        id: uid(),
        ...compForm,
        source: "manual",
        date: new Date().toISOString(),
      },
    ]);
    setCompForm({ suburb: property?.suburb || "", bedrooms: 1, price: "" });
    showToast("Comp added");
  }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Pricing recommendations</h1>
      <div className="flex gap-3 mb-6">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="text-sm px-3 py-2 rounded-md border"
          style={{ borderColor: COLORS.sand }}
        >
          {properties.length === 0 && <option>No properties yet</option>}
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={monthIdx}
          onChange={(e) => setMonthIdx(Number(e.target.value))}
          className="text-sm px-3 py-2 rounded-md border"
          style={{ borderColor: COLORS.sand }}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {!property ? (
        <Card>
          <p className="text-sm" style={{ color: COLORS.warmgray }}>
            Add a property first to see pricing recommendations.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>
              Minimum
            </div>
            <div className="amble-display text-2xl">R{pricing.min}</div>
          </Card>
          <Card className="ring-2" style={{ borderColor: COLORS.teal }}>
            <div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>
              Optimal ({pricing.season.label})
            </div>
            <div
              className="amble-display text-2xl"
              style={{ color: COLORS.teal }}
            >
              R{pricing.optimal}
            </div>
          </Card>
          <Card>
            <div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>
              Maximum
            </div>
            <div className="amble-display text-2xl">R{pricing.max}</div>
          </Card>
        </div>
      )}

      {property && (
        <Card className="mb-6">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span style={{ color: COLORS.warmgray }}>Comps used: </span>
              {pricing.compCount} in {property.suburb}
            </div>
            <div>
              <span style={{ color: COLORS.warmgray }}>
                Projected occupancy:{" "}
              </span>
              {pricing.occupancy.toFixed(0)}%
            </div>
            <div>
              <span style={{ color: COLORS.warmgray }}>
                Projected monthly revenue:{" "}
              </span>
              R{pricing.revenue.toLocaleString()}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-medium mb-3">
          Market comps for {property?.suburb || "this area"}
        </h3>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <input
            placeholder="Suburb"
            value={compForm.suburb}
            onChange={(e) =>
              setCompForm({ ...compForm, suburb: e.target.value })
            }
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          />
          <input
            type="number"
            placeholder="Bedrooms"
            value={compForm.bedrooms}
            onChange={(e) =>
              setCompForm({ ...compForm, bedrooms: e.target.value })
            }
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          />
          <input
            type="number"
            placeholder="Price/night (R)"
            value={compForm.price}
            onChange={(e) =>
              setCompForm({ ...compForm, price: e.target.value })
            }
            className="text-sm px-3 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          />
          <button
            onClick={addComp}
            className="text-sm rounded-md flex items-center justify-center gap-1"
            style={{ background: COLORS.teal, color: COLORS.offwhite }}
          >
            <Plus size={14} />
            Add comp
          </button>
        </div>
        <div className="space-y-1">
          {relevantComps.map((c) => (
            <div
              key={c.id}
              className="flex justify-between text-sm py-1.5 border-b last:border-0"
              style={{ borderColor: COLORS.sand }}
            >
              <span>
                {c.suburb} · {c.bedrooms} bed
              </span>
              <span>R{c.price}/night</span>
            </div>
          ))}
          {relevantComps.length === 0 && (
            <p className="text-xs" style={{ color: COLORS.warmgray }}>
              No comps logged yet for this suburb — add a few to sharpen the
              recommendation.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Bookings({ properties, bookings, setBookings, showToast }) {
  const [form, setForm] = useState({
    propertyId: "",
    checkIn: "",
    checkOut: "",
    rate: "",
    platform: "Airbnb",
  });

  useEffect(() => {
    if (!form.propertyId && properties.length)
      setForm((f) => ({ ...f, propertyId: properties[0].id }));
  }, [properties]);

  function addBooking() {
    if (!form.propertyId || !form.checkIn || !form.checkOut || !form.rate) {
      showToast("All fields required");
      return;
    }
    setBookings([...bookings, { id: uid(), ...form }]);
    showToast("Booking logged");
    setForm({ ...form, checkIn: "", checkOut: "", rate: "" });
  }

  function remove(id) {
    setBookings(bookings.filter((b) => b.id !== id));
  }

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Bookings log</h1>
      <Card className="mb-6">
        <h3 className="text-sm font-medium mb-3">Log a booking</h3>
        <div className="grid grid-cols-5 gap-2">
          <select
            value={form.propertyId}
            onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
            className="text-sm px-2 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.checkIn}
            onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
            className="text-sm px-2 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          />
          <input
            type="date"
            value={form.checkOut}
            onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
            className="text-sm px-2 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          />
          <input
            type="number"
            placeholder="Rate (R)"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
            className="text-sm px-2 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          />
          <select
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
            className="text-sm px-2 py-2 rounded-md border"
            style={{ borderColor: COLORS.sand }}
          >
            <option>Airbnb</option>
            <option>Booking.com</option>
            <option>Direct</option>
          </select>
        </div>
        <button
          onClick={addBooking}
          className="mt-3 text-sm px-4 py-2 rounded-md"
          style={{ background: COLORS.teal, color: COLORS.offwhite }}
        >
          Log booking
        </button>
      </Card>

      <Card>
        <h3 className="text-sm font-medium mb-3">All bookings</h3>
        <div className="space-y-1">
          {bookings.length === 0 && (
            <p className="text-xs" style={{ color: COLORS.warmgray }}>
              No bookings logged yet.
            </p>
          )}
          {bookings.map((b) => {
            const p = properties.find((p) => p.id === b.propertyId);
            const nights = Math.max(
              1,
              Math.round(
                (new Date(b.checkOut) - new Date(b.checkIn)) / 86400000,
              ),
            );
            return (
              <div
                key={b.id}
                className="flex justify-between items-center text-sm py-2 border-b last:border-0"
                style={{ borderColor: COLORS.sand }}
              >
                <span>
                  {p?.name || "Unknown"} · {b.checkIn} → {b.checkOut} ({nights}
                  n) · {b.platform}
                </span>
                <div className="flex items-center gap-3">
                  <span>R{b.rate}/night</span>
                  <button
                    onClick={() => remove(b.id)}
                    style={{ color: COLORS.terracotta }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ListingScore({ properties, scores, setScores, showToast }) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id || "");
  useEffect(() => {
    if (!selectedId && properties.length) setSelectedId(properties[0].id);
  }, [properties]);

  const current = scores[selectedId] || {
    photoCount: 0,
    titleOptimized: false,
    amenityCount: 0,
    instantBook: false,
    responseUnderHour: false,
    responseUnderDay: false,
  };
  const result = scoreListing(current);

  function update(field, value) {
    const next = { ...current, [field]: value };
    setScores({ ...scores, [selectedId]: next });
  }

  const suggestions = [];
  if (result.photo < 25)
    suggestions.push("Add more high-quality photos (aim for 20+).");
  if (result.title < 20)
    suggestions.push("Optimize the title with keywords guests search for.");
  if (result.amenity < 20)
    suggestions.push(
      "List more amenities — every one counts toward search ranking.",
    );
  if (result.instant === 0)
    suggestions.push(
      "Turn on Instant Book — it meaningfully boosts visibility.",
    );
  if (result.response < 20)
    suggestions.push("Get response time under 1 hour to protect your ranking.");

  return (
    <div>
      <h1 className="amble-display text-3xl mb-6">Listing quality score</h1>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="text-sm px-3 py-2 rounded-md border mb-6"
        style={{ borderColor: COLORS.sand }}
      >
        {properties.length === 0 && <option>No properties yet</option>}
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {properties.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: COLORS.warmgray }}>
            Add a property first.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <div className="space-y-4">
              <Field label={`Photo count (${current.photoCount || 0})`}>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={current.photoCount || 0}
                  onChange={(e) => update("photoCount", Number(e.target.value))}
                  className="w-full"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!current.titleOptimized}
                  onChange={(e) => update("titleOptimized", e.target.checked)}
                />{" "}
                Title & description are optimized with keywords
              </label>
              <Field label={`Amenities listed (${current.amenityCount || 0})`}>
                <input
                  type="range"
                  min="0"
                  max="15"
                  value={current.amenityCount || 0}
                  onChange={(e) =>
                    update("amenityCount", Number(e.target.value))
                  }
                  className="w-full"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!current.instantBook}
                  onChange={(e) => update("instantBook", e.target.checked)}
                />{" "}
                Instant Book enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!current.responseUnderHour}
                  onChange={(e) =>
                    update("responseUnderHour", e.target.checked)
                  }
                />{" "}
                Response time under 1 hour
              </label>
            </div>
          </Card>

          <div>
            <Card className="mb-4 text-center">
              <div className="text-xs mb-1" style={{ color: COLORS.warmgray }}>
                Listing health score
              </div>
              <div
                className="amble-display text-5xl"
                style={{
                  color:
                    result.total >= 80
                      ? COLORS.teal
                      : result.total >= 50
                        ? COLORS.terracotta
                        : COLORS.warmgray,
                }}
              >
                {result.total}
              </div>
              <div className="text-xs" style={{ color: COLORS.warmgray }}>
                out of 100
              </div>
            </Card>
            {suggestions.length > 0 && (
              <Card>
                <h3 className="text-sm font-medium mb-2">Suggestions</h3>
                <ul className="text-sm space-y-1.5">
                  {suggestions.map((s, i) => (
                    <li key={i} style={{ color: COLORS.charcoal }}>
                      · {s}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
