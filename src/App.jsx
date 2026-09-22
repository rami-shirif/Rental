import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  connectFirebase,
  readCollection,
  writeItem,
  deleteItem,
} from "./firebase";
import "./styles.css";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;
const money = (n) => `${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} MAD`;
const dateText = (value) => new Date(value).toLocaleDateString("en-GB", {
  day: "2-digit", month: "short", year: "numeric"
});
const dateTimeText = (value) => new Date(value).toLocaleString("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
});
const pad2 = (n) => String(Math.max(0, n)).padStart(2, "0");

function endDate(rental) {
  return new Date(new Date(rental.startDate).getTime() + Number(rental.days) * DAY_MS);
}
function daysLeft(rental) {
  return Math.ceil((endDate(rental).getTime() - Date.now()) / DAY_MS);
}

// Breaks a millisecond duration into whole days / hours / minutes / seconds.
function splitDuration(ms) {
  const abs = Math.abs(ms);
  return {
    d: Math.floor(abs / DAY_MS),
    h: Math.floor((abs % DAY_MS) / HOUR_MS),
    m: Math.floor((abs % HOUR_MS) / MIN_MS),
    s: Math.floor((abs % MIN_MS) / 1000),
  };
}

// Ticks once a second so any component using it re-renders with a live clock.
function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function App() {
  const [cars, setCars] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [contractRental, setContractRental] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        await connectFirebase();
        const [carsData, rentalsData] = await Promise.all([
          readCollection("cars"),
          readCollection("rentals"),
        ]);
        setCars(Object.values(carsData || {}));
        setRentals(Object.values(rentalsData || {}));
      } catch (error) {
        console.error(error);
        notify("Firebase connection failed. Check Anonymous Auth and database rules.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function notify(message) {
    setToast(message);
    window.clearTimeout(window.__fleetToast);
    window.__fleetToast = window.setTimeout(() => setToast(""), 2800);
  }

  async function persist(path, id, value) {
    setSaving(true);
    try {
      await writeItem(path, id, value);
    } catch (error) {
      console.error(error);
      notify("Could not save to Firebase.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function addCar(data) {
    const car = { id: uid(), status: "available", createdAt: new Date().toISOString(), ...data };
    try {
      await persist("cars", car.id, car);
      setCars((prev) => [...prev, car]);
      notify(`${car.name} added to the fleet`);
    } catch {}
  }

  async function deleteCar(id) {
    if (rentals.some((r) => r.carId === id && !r.returned)) {
      notify("Can't remove a car that is currently rented.");
      return;
    }
    try {
      await deleteItem("cars", id);
      setCars((prev) => prev.filter((c) => c.id !== id));
      notify("Car removed.");
    } catch {
      notify("Could not remove car.");
    }
  }

  async function addRental(data) {
    const rental = {
      id: uid(),
      returned: false,
      createdAt: new Date().toISOString(),
      ...data,
    };
    const car = cars.find((c) => c.id === rental.carId);
    if (!car) return;

    try {
      await Promise.all([
        persist("rentals", rental.id, rental),
        persist("cars", car.id, { ...car, status: "rented" }),
      ]);
      setRentals((prev) => [...prev, rental]);
      setCars((prev) => prev.map((c) => c.id === car.id ? { ...c, status: "rented" } : c));
      notify(`Rental started for ${rental.customerName}`);
      setContractRental(rental);
    } catch {}
  }

  async function returnRental(id) {
    const rental = rentals.find((r) => r.id === id);
    if (!rental) return;
    const car = cars.find((c) => c.id === rental.carId);
    const updatedRental = { ...rental, returned: true, returnedAt: new Date().toISOString() };
    try {
      await persist("rentals", id, updatedRental);
      if (car) await persist("cars", car.id, { ...car, status: "available" });
      setRentals((prev) => prev.map((r) => r.id === id ? updatedRental : r));
      setCars((prev) => prev.map((c) => c.id === rental.carId ? { ...c, status: "available" } : c));
      notify("Car marked as returned.");
    } catch {}
  }

  const stats = useMemo(() => {
    const active = rentals.filter((r) => !r.returned);
    return {
      total: cars.length,
      available: cars.filter((c) => c.status === "available").length,
      rented: cars.filter((c) => c.status === "rented").length,
      overdue: active.filter((r) => daysLeft(r) < 0).length,
      revenue: rentals.reduce((sum, r) => sum + Number(r.days || 0) * Number(r.pricePerDay || 0), 0),
      active,
    };
  }, [cars, rentals]);

  if (loading) return <div className="loading">Hello 👋</div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">◍</span> Rental Cars Manager</div>
        <nav>
          {[
            ["dashboard", "Overview"], ["fleet", "Fleet"], ["rentals", "Rentals"], ["availability", "Availability"]
          ].map(([id, label]) => (
            <motion.button
              key={id}
              className={tab === id ? "nav active" : "nav"}
              onClick={() => setTab(id)}
              whileTap={{ scale: 0.94 }}
            >
              {tab === id && (
                <motion.span
                  className="nav-indicator"
                  layoutId="navIndicator"
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              )}
              <span className="nav-label">{label}</span>
            </motion.button>
          ))}
        </nav>
        <div className="cloud-status"><span className="online-dot" /> Firebase connected</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">FLEET MANAGEMENT</div>
            <h1>{tab === "dashboard" ? "Overview" : tab[0].toUpperCase() + tab.slice(1)}</h1>
          </div>
          <div className="stats">
            <Stat label="Cars" value={stats.total} />
            <Stat label="Available" value={stats.available} cls="teal" />
            <Stat label="Rented" value={stats.rented} cls="amber" />
            <Stat label="Revenue" value={money(stats.revenue)} />
          </div>
        </header>

        <div className="content">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {tab === "dashboard" && <Dashboard stats={stats} cars={cars} onReturn={returnRental} onContract={setContractRental} />}
              {tab === "fleet" && <Fleet cars={cars} rentals={rentals} onAdd={addCar} onDelete={deleteCar} />}
              {tab === "rentals" && <Rentals cars={cars} rentals={rentals} onAdd={addRental} onReturn={returnRental} onContract={setContractRental} />}
              {tab === "availability" && <Availability cars={cars} rentals={rentals} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {saving && (
          <motion.div
            className="saving"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            Saving…
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {contractRental && (
          <ContractModal
            rental={contractRental}
            car={cars.find((c) => c.id === contractRental.carId)}
            onClose={() => setContractRental(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, cls = "" }) {
  return <div className={`stat ${cls}`}><span>{label}</span><strong>{value}</strong></div>;
}

// Animated progress bar + live countdown timer for an active rental.
function CountdownBar({ rental }) {
  const now = useClock(1000);
  const start = new Date(rental.startDate).getTime();
  const end = endDate(rental).getTime();
  const totalMs = Math.max(1, end - start);
  const remainingMs = end - now;
  const overdue = remainingMs < 0;
  const urgent = !overdue && remainingMs < DAY_MS;
  const elapsedPct = Math.max(0, Math.min(100, ((now - start) / totalMs) * 100));
  const { d, h, m, s } = splitDuration(remainingMs);

  const label = overdue
    ? `${d > 0 ? `${d}d ` : ""}${pad2(h)}:${pad2(m)}:${pad2(s)} overdue`
    : `${d > 0 ? `${d}d ` : ""}${pad2(h)}:${pad2(m)}:${pad2(s)} left`;
  const notified = overdue ? rental.notifiedOverdue : rental.notifiedSoon;

  return (
    <div className={`countdown ${overdue ? "danger" : urgent ? "urgent" : ""}`}>
      <div className="countdown-bar">
        <motion.i
          initial={false}
          animate={{ width: `${elapsedPct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <motion.span
        className="countdown-timer"
        key={overdue ? "over" : "left"}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {notified ? "🔔 " : ""}{label}
      </motion.span>
    </div>
  );
}

function Dashboard({ stats, cars, onReturn, onContract }) {
  const upcoming = [...stats.active].sort((a, b) => daysLeft(a) - daysLeft(b)).slice(0, 6);
  return (
    <div className="grid">
      <section className="panel">
        <div className="panel-head"><h2>Due back soon</h2><span>{stats.overdue} overdue</span></div>
        {upcoming.length === 0 ? <Empty text="No active rentals right now." /> : (
          <motion.div className="list" variants={formStagger} initial="hidden" animate="show">
            <AnimatePresence>
              {upcoming.map((r) => {
                const car = cars.find((c) => c.id === r.carId);
                const left = daysLeft(r);
                return <motion.div className="list-row" key={r.id} layout variants={fieldVariants} exit={{ opacity: 0, x: -12 }}>
                  <div><b>{car ? `${car.name} · ${car.model}` : "Unknown car"}</b><small>{r.customerName} · CIN {r.cin}</small></div>
                  <CountdownBar rental={r} />
                  <div className="list-btn">
                  <motion.button className="ghost" onClick={() => onContract(r)} whileTap={{ scale: 0.95 }}>Contract</motion.button>
                  <motion.button className="ghost" onClick={() => onReturn(r.id)} whileTap={{ scale: 0.95 }}>Return</motion.button>
                  </div>
                </motion.div>;
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>At a glance</h2></div>
        <motion.div className="glance" variants={formStagger} initial="hidden" animate="show">
          <motion.div variants={fieldVariants}><strong>{stats.available}</strong><span>ready to rent</span></motion.div>
          <motion.div variants={fieldVariants}><strong>{stats.rented}</strong><span>with customers</span></motion.div>
          <motion.div variants={fieldVariants}><strong className={stats.overdue ? "danger-text" : ""}>{stats.overdue}</strong><span>overdue returns</span></motion.div>
          <motion.div variants={fieldVariants}><strong>{money(stats.revenue)}</strong><span>lifetime revenue</span></motion.div>
        </motion.div>
      </section>
    </div>
  );
}

function Fleet({ cars, rentals, onAdd, onDelete }) {
  const [form, setForm] = useState({ name: "", model: "", pricePerDay: "", plate: "", color: "" });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.model.trim() || Number(form.pricePerDay) <= 0) return;
    await onAdd({ ...form, name: form.name.trim(), model: form.model.trim(), pricePerDay: Number(form.pricePerDay) });
    setForm({ name: "", model: "", pricePerDay: "", plate: "", color: "" });
  };
  return <div className="grid">
    <section className="panel">
      <h2>Add a car</h2>
      <motion.form className="form" onSubmit={submit} variants={formStagger} initial="hidden" animate="show">
        <Field label="Make / name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Volkswagen Golf" />
        <Field label="Model / trim" value={form.model} onChange={(v) => setForm({ ...form, model: v })} placeholder="e.g. 7 GTI 2022" />
        <Field label="License plate" value={form.plate} onChange={(v) => setForm({ ...form, plate: v })} placeholder="e.g. 12345-A-6" />
        <Field label="Color" value={form.color} onChange={(v) => setForm({ ...form, color: v })} placeholder="e.g. Black" />
        <Field label="Price per day (MAD)" type="number" value={form.pricePerDay} onChange={(v) => setForm({ ...form, pricePerDay: v })} placeholder="350" />
        <motion.button className="primary" variants={fieldVariants} whileTap={{ scale: 0.97 }}>Add car</motion.button>
      </motion.form>
    </section>
    <section className="panel">
      <div className="panel-head"><h2>Fleet ({cars.length})</h2></div>
      {cars.length === 0 ? <Empty text="No cars yet." /> : <motion.div className="cards" variants={formStagger} initial="hidden" animate="show">
        <AnimatePresence>
          {cars.map((c) => {
            const active = rentals.find((r) => r.carId === c.id && !r.returned);
            return <motion.article
              className="car-card"
              key={c.id}
              layout
              variants={fieldVariants}
              exit={{ opacity: 0, scale: 0.95 }}
              whileHover={{ y: -2 }}
            >
              <div className="car-top"><div><b>{c.name}</b><small>{c.model}</small></div><span className={`status ${c.status}`} /></div>
              <div className="car-meta">{c.plate || "No plate"} {c.color ? `· ${c.color}` : ""}</div>
              <div className="price">{money(c.pricePerDay)}<small>/day</small></div>
              {active && <div className="rented-note">With {active.customerName} · {daysLeft(active)}d left</div>}
              <motion.button className="ghost" onClick={() => onDelete(c.id)} whileTap={{ scale: 0.95 }}>Remove</motion.button>
            </motion.article>;
          })}
        </AnimatePresence>
      </motion.div>}
    </section>
  </div>;
}

function Rentals({ cars, rentals, onAdd, onReturn, onContract }) {
  const available = cars.filter((c) => c.status === "available");
  const [form, setForm] = useState({ carId: "", customerName: "", cin: "", phone: "", days: 1 });
  const car = cars.find((c) => c.id === form.carId);
  const total = car ? Number(car.pricePerDay) * Number(form.days || 0) : 0;

  async function submit(e) {
    e.preventDefault();
    if (!car || !form.customerName.trim() || !form.cin.trim() || Number(form.days) <= 0) return;
    await onAdd({
      carId: car.id,
      customerName: form.customerName.trim(),
      cin: form.cin.trim(),
      phone: form.phone.trim(),
      days: Number(form.days),
      pricePerDay: Number(car.pricePerDay),
      totalPrice: total,
      startDate: new Date().toISOString(),
    });
    setForm({ carId: "", customerName: "", cin: "", phone: "", days: 1 });
  }

  const active = rentals.filter((r) => !r.returned);
  const history = [...rentals].filter((r) => r.returned).reverse();

  return <div className="grid">
    <section className="panel">
      <h2>New rental</h2>
      <motion.form className="form" onSubmit={submit} variants={formStagger} initial="hidden" animate="show">
        <motion.div variants={fieldVariants}>
          <CarSelect
            value={form.carId}
            cars={available}
            onChange={(value) => setForm({ ...form, carId: value })}
          />
        </motion.div>
        <Field label="Customer name" value={form.customerName} onChange={(v) => setForm({ ...form, customerName: v })} placeholder="Full name" />
        <Field label="CIN / ID" value={form.cin} onChange={(v) => setForm({ ...form, cin: v })} placeholder="ID number" />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+212 ..." />
        <Field label="Rental days" type="number" value={form.days} onChange={(v) => setForm({ ...form, days: v })} />
        <motion.div className="total" layout variants={fieldVariants} transition={{ duration: 0.3, ease: "easeOut" }}>
          <span>Total price</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.strong
              key={total}
              initial={{ y: -14, opacity: 0, scale: 0.92 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 14, opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {money(total)}
            </motion.strong>
          </AnimatePresence>
        </motion.div>
        <motion.button className="primary" variants={fieldVariants} whileTap={{ scale: 0.97 }} disabled={!available.length}>{available.length ? "Start rental" : "No cars available"}</motion.button>
      </motion.form>
    </section>

    <section className="panel">
      <div className="panel-head"><h2>Active rentals ({active.length})</h2></div>
      {active.length === 0 ? <Empty text="No active rentals." /> : <motion.div className="list" variants={formStagger} initial="hidden" animate="show">
        <AnimatePresence>
          {active.map((r) => {
            const c = cars.find((x) => x.id === r.carId);
            return <motion.div className="rental-row" key={r.id} layout variants={fieldVariants} exit={{ opacity: 0, x: -12 }}>
              <div className="rental-main">
                <b>{r.customerName}</b>
                <small>{c ? `${c.name} · ${c.model}` : "Unknown car"} · CIN {r.cin}</small>
                <small>{dateText(r.startDate)} → {dateText(endDate(r))} · {money(r.totalPrice || r.days * r.pricePerDay)}</small>
              </div>
              <CountdownBar rental={r} />
              <motion.button className="ghost" onClick={() => onContract(r)} whileTap={{ scale: 0.95 }}>Contract</motion.button>
              <motion.button className="ghost" onClick={() => onReturn(r.id)} whileTap={{ scale: 0.95 }}>Return</motion.button>
            </motion.div>;
          })}
        </AnimatePresence>
      </motion.div>}
      {history.length > 0 && <><h2 className="history-title">Rental history ({history.length})</h2><motion.div className="list" variants={formStagger} initial="hidden" animate="show">
        {history.slice(0, 10).map((r) => <motion.div className="rental-row muted" key={r.id} layout variants={fieldVariants}>
          <div className="rental-main"><b>{r.customerName}</b><small>{cars.find((c) => c.id === r.carId)?.name || "Unknown car"} · {money(r.totalPrice || r.days * r.pricePerDay)}</small><small>Returned {dateTimeText(r.returnedAt)}</small></div>
          <span className="pill returned">Returned</span><motion.button className="ghost" onClick={() => onContract(r)} whileTap={{ scale: 0.95 }}>Contract</motion.button>
        </motion.div>)}
      </motion.div></>}
    </section>
  </div>;
}

function Availability({ cars, rentals }) {
  const sortedCars = [...cars].sort((a, b) => {
    const aAvailable = a.status === "available" ? 0 : 1;
    const bAvailable = b.status === "available" ? 0 : 1;
    return aAvailable - bAvailable;
  });

  return <section className="panel">
    <div className="panel-head"><h2>Vehicle availability</h2><span>{cars.length} cars</span></div>
    <motion.div className="availability" variants={formStagger} initial="hidden" animate="show">
      {sortedCars.map((c) => {
        const r = rentals.find((x) => x.carId === c.id && !x.returned);
        return <motion.div className="availability-row" key={c.id} layout variants={fieldVariants}>
          <div className={`status ${c.status}`} />
          <div className="avail-name"><b>{c.name} · {c.model}</b><small>{r ? `${r.customerName} · returns ${dateText(endDate(r))}` : `Ready · ${money(c.pricePerDay)}/day`}</small></div>
          {r ? <CountdownBar rental={r} /> : (
            <>
              <div className="bar"><motion.i initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.6, ease: "easeOut" }} /></div>
              <span className="pill">Available</span>
            </>
          )}
        </motion.div>;
      })}
    </motion.div>
  </section>;
}

function CarSelect({ value, cars, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = cars.find((c) => c.id === value);

  useEffect(() => {
    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <label className="custom-select-field" ref={ref}>
      <span>Car</span>
      <motion.button
        type="button"
        className={`custom-select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        whileTap={{ scale: 0.99 }}
      >
        <span className={selected ? "selected-value" : "placeholder"}>
          {selected ? `${selected.name} · ${selected.model}` : "Select available car"}
        </span>
        <motion.span
          className="select-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
        >⌄</motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="custom-select-menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {cars.length === 0 ? (
              <div className="custom-select-empty">No available cars</div>
            ) : cars.map((car) => (
              <motion.button
                type="button"
                key={car.id}
                className={`custom-select-option ${car.id === value ? "active" : ""}`}
                onClick={() => { onChange(car.id); setOpen(false); }}
                whileTap={{ scale: 0.98 }}
              >
                <span>
                  <b>{car.name}</b>
                  <small>{car.model} · {money(car.pricePerDay)}/day</small>
                </span>
                {car.id === value && <span className="select-check">✓</span>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </label>
  );
}

function ContractModal({ rental, car, onClose }) {
  return <motion.div
    className="modal-backdrop"
    onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18 }}
  >
    <motion.div
      className="contract-modal"
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="modal-actions">
        <motion.button className="ghost" onClick={onClose} whileTap={{ scale: 0.95 }}>Close</motion.button>
        <motion.button className="primary" onClick={() => window.print()} whileTap={{ scale: 0.95 }}>Print contract</motion.button>
      </div>
      <div className="contract" id="print-contract">
        <header className="contract-header">
          <div><div className="contract-logo">RENTAL CARS</div><small>Vehicle Rental Agreement</small></div>
          <div className="contract-number">Contract #{rental.id.slice(-8).toUpperCase()}</div>
        </header>
        <div className="contract-title"><h1>CAR RENTAL CONTRACT</h1><p>Agreement date: {dateText(rental.startDate)}</p></div>
        <div className="contract-grid">
          <Info title="CUSTOMER" rows={[
            ["Full name", rental.customerName], ["CIN / ID", rental.cin], ["Phone", rental.phone || "—"]
          ]}/>
          <Info title="VEHICLE" rows={[
            ["Vehicle", car ? `${car.name} ${car.model}` : "—"], ["Plate", car?.plate || "—"], ["Color", car?.color || "—"]
          ]}/>
        </div>
        <div className="contract-grid">
          <Info title="RENTAL PERIOD" rows={[
            ["Start", dateTimeText(rental.startDate)], ["Return", dateTimeText(endDate(rental))], ["Duration", `${rental.days} day(s)`]
          ]}/>
          <Info title="PAYMENT" rows={[
            ["Daily rate", money(rental.pricePerDay)], ["Total", money(rental.totalPrice || rental.days * rental.pricePerDay)], ["Status", rental.returned ? "Completed" : "Active"]
          ]}/>
        </div>
        <div className="terms">
          <h3>Terms & Conditions</h3>
          <ol>
            <li>The customer confirms receipt of the vehicle in good rental condition unless noted separately.</li>
            <li>The vehicle must be returned on the agreed date and time.</li>
            <li>The customer is responsible for fines, damage caused by misuse, and unauthorized use.</li>
            <li>Any extension must be agreed with the rental agency before the original return time.</li>
          </ol>
        </div>
        <div className="inspection">
          <h3>Vehicle condition / notes</h3>
          <div className="line" /><div className="line" /><div className="line" />
        </div>
        <div className="signatures">
          <div><span>Customer signature</span><div /></div>
          <div><span>Agency representative</span><div /></div>
        </div>
        <footer>Generated from Rental Cars Manager · {dateTimeText(new Date())}</footer>
      </div>
    </motion.div>
  </motion.div>;
}

function Info({ title, rows }) {
  return <div className="info-box"><h3>{title}</h3>{rows.map(([a,b]) => <div className="info-row" key={a}><span>{a}</span><b>{b}</b></div>)}</div>;
}

const fieldVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <motion.label variants={fieldVariants}>
      {label}
      <motion.input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        whileFocus={{ scale: 1.015, borderColor: "var(--amber)" }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      />
    </motion.label>
  );
}
function Empty({ text }) { return <div className="empty">{text}</div>; }

const formStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
