import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; 
const SUPABASE_WRITE_KEY = import.meta.env.VITE_SUPABASE_KEY;  

// Passcode PIN (Default: 2580)
const ADMIN_PIN = "2580";
const MAX_PIN_LENGTH = 4;

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem('control_authenticated') === 'true'
  );
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState(false);
  const lockScreenRef = useRef(null);

  // Settings Controls State (What the user configures in UI)
  const [isActive, setIsActive] = useState(true);
  const [goldAdjust, setGoldAdjust] = useState(0);
  const [useGoldOverride, setUseGoldOverride] = useState(false);
  const [overrideGold, setOverrideGold] = useState(0);
  const [silverAdjust, setSilverAdjust] = useState(0);
  const [useSilverOverride, setUseSilverOverride] = useState(false);
  const [overrideSilver, setOverrideSilver] = useState(0);

  // Live Live Price Stats (What is active in the DB right now)
  const [goldOcr, setGoldOcr] = useState(null);
  const [silverOcr, setSilverOcr] = useState(null);
  const [goldHistory, setGoldHistory] = useState([]);
  const [silverHistory, setSilverHistory] = useState([]);

  // UI Actions State
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", isError: false });
  const supabaseRef = useRef(null);

  // Refs to hold configuration values so WebSocket doesn't need to reconnect on state changes
  const configRef = useRef({
    goldAdjust: 0,
    useGoldOverride: false,
    silverAdjust: 0,
    useSilverOverride: false
  });

  // Keep refs in sync with controls
  useEffect(() => {
    configRef.current = {
      goldAdjust,
      useGoldOverride,
      silverAdjust,
      useSilverOverride
    };
  }, [goldAdjust, useGoldOverride, silverAdjust, useSilverOverride]);

  // Initialize Supabase Client once
  useEffect(() => {
    if (SUPABASE_URL && SUPABASE_WRITE_KEY) {
      supabaseRef.current = createClient(SUPABASE_URL, SUPABASE_WRITE_KEY);
    }
  }, []);

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 2500);
  };

  // PIN Keypad Handlers
  const pressKey = (num) => {
    if (pinInput.length < MAX_PIN_LENGTH) {
      const newInput = pinInput + num;
      setPinInput(newInput);
      if (newInput.length === MAX_PIN_LENGTH) {
        setTimeout(() => verifyPin(newInput), 150);
      }
    }
  };

  const clearPin = () => {
    setPinInput("");
    setLoginError(false);
  };

  const verifyPin = (inputToVerify) => {
    if (inputToVerify === ADMIN_PIN) {
      sessionStorage.setItem('control_authenticated', 'true');
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      if (lockScreenRef.current) {
        lockScreenRef.current.style.animation = "shake 0.3s ease";
        setTimeout(() => {
          if (lockScreenRef.current) lockScreenRef.current.style.animation = "";
        }, 300);
      }
      setPinInput("");
    }
  };

  const logout = () => {
    sessionStorage.removeItem('control_authenticated');
    setIsAuthenticated(false);
    setPinInput("");
  };

  // Parse raw OCR rates from uploaded logs
  const parseOcrPrice = (row, activeSettings) => {
    const finalPrice = parseFloat(row.price);
    let rawPrice = null;

    if (row.raw_text && row.raw_text.includes("OCR Raw:")) {
      const match = row.raw_text.match(/OCR Raw:\s*(\d+(\.\d+)?)/);
      if (match) {
        rawPrice = parseFloat(match[1]);
      }
    }

    if (rawPrice === null) {
      if (row.item === 'gold_995_100gms') {
        rawPrice = activeSettings.useGoldOverride ? null : (finalPrice - activeSettings.goldAdjust);
      } else {
        rawPrice = activeSettings.useSilverOverride ? null : (finalPrice - activeSettings.silverAdjust);
      }
    }
    return rawPrice;
  };

  // 1. One-time Setup: Subscriptions & Initial Loads
  useEffect(() => {
    if (!isAuthenticated || !supabaseRef.current) return;

    const supabase = supabaseRef.current;

    // Load initial settings and lists
    const loadData = async () => {
      try {
        // A. Load Settings
        const { data: settings } = await supabase
          .from('bullion_settings')
          .select('*')
          .eq('id', 1)
          .single();

        if (settings) {
          setIsActive(settings.is_active);
          setGoldAdjust(parseFloat(settings.gold_adjustment) || 0);
          setUseGoldOverride(settings.use_gold_override);
          setOverrideGold(parseFloat(settings.override_gold) || 0);
          setSilverAdjust(parseFloat(settings.silver_adjustment) || 0);
          setUseSilverOverride(settings.use_silver_override);
          setOverrideSilver(parseFloat(settings.override_silver) || 0);

          // B. Load Recent Price history logs
          const { data: goldHist } = await supabase
            .from('bullion_rates')
            .select('*')
            .eq('item', 'gold_995_100gms')
            .order('created_at', { ascending: false })
            .limit(6);
          if (goldHist) {
            setGoldHistory(goldHist);
            const ocr = parseOcrPrice(goldHist[0], {
              useGoldOverride: settings.use_gold_override,
              goldAdjust: parseFloat(settings.gold_adjustment) || 0
            });
            if (ocr !== null) setGoldOcr(ocr);
          }

          const { data: silverHist } = await supabase
            .from('bullion_rates')
            .select('*')
            .eq('item', 'silver_999_1kg')
            .order('created_at', { ascending: false })
            .limit(6);
          if (silverHist) {
            setSilverHistory(silverHist);
            const ocr = parseOcrPrice(silverHist[0], {
              useSilverOverride: settings.use_silver_override,
              silverAdjust: parseFloat(settings.silver_adjustment) || 0
            });
            if (ocr !== null) setSilverOcr(ocr);
          }
        }
      } catch (err) {
        console.error("Error loading initial data:", err);
      }
    };

    loadData();

    // Setup Permanent Rates WebSocket (Broadcast & Postgres Insert)
    const handleNewRate = (row) => {
      if (!row) return;
      const currentSettings = configRef.current;
      if (row.item === 'gold_995_100gms') {
        setGoldHistory(prev => [row, ...prev.filter(r => r.id !== row.id).slice(0, 5)]);
        const ocr = parseOcrPrice(row, currentSettings);
        if (ocr !== null) setGoldOcr(ocr);
      } else if (row.item === 'silver_999_1kg') {
        setSilverHistory(prev => [row, ...prev.filter(r => r.id !== row.id).slice(0, 5)]);
        const ocr = parseOcrPrice(row, currentSettings);
        if (ocr !== null) setSilverOcr(ocr);
      }
    };

    const ratesChannel = supabase
      .channel('live-rates-topic')
      .on('broadcast', { event: 'rate_update' }, (payload) => {
        handleNewRate(payload.payload);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bullion_rates'
      }, (payload) => {
        handleNewRate(payload.new);
      })
      .subscribe();


    // Setup Permanent Settings Sync WebSocket
    const settingsChannel = supabase
      .channel('monitor-settings-channel')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bullion_settings',
        filter: 'id=eq.1'
      }, (payload) => {
        const row = payload.new;
        const prev = payload.old;
        // Ignore heartbeat-only updates (where updated_at did not change)
        if (prev && row.updated_at === prev.updated_at) {
          return;
        }
        setIsActive(row.is_active);
        setGoldAdjust(row.gold_adjustment);
        setUseGoldOverride(row.use_gold_override);
        setOverrideGold(row.override_gold);
        setSilverAdjust(row.silver_adjustment);
        setUseSilverOverride(row.use_silver_override);
        setOverrideSilver(row.override_silver);
      })
      .subscribe();


    // Standby Heartbeat Loop
    const sendHeartbeat = async () => {
      try {
        await supabase
          .from('bullion_settings')
          .update({ last_active_at: new Date() })
          .eq('id', 1);
      } catch (err) {
        console.error("Heartbeat error:", err);
      }
    };

    sendHeartbeat();
    const heartbeatTimer = setInterval(sendHeartbeat, 10000);

    return () => {
      ratesChannel.unsubscribe();
      settingsChannel.unsubscribe();
      clearInterval(heartbeatTimer);
    };
  }, [isAuthenticated]);

  // Instant saving helpers for switches to prevent heartbeat race conditions
  const toggleActiveState = async (val) => {
    setIsActive(val);
    if (!supabaseRef.current) return;
    try {
      await supabaseRef.current
        .from('bullion_settings')
        .update({ is_active: val, updated_at: new Date() })
        .eq('id', 1);
      showToast(val ? "Live streaming turned ON" : "Live streaming turned OFF");
    } catch (err) {
      console.error(err);
      showToast("Failed to update status", true);
    }
  };

  const toggleGoldOverride = async (val) => {
    setUseGoldOverride(val);
    if (!supabaseRef.current) return;
    try {
      await supabaseRef.current
        .from('bullion_settings')
        .update({ use_gold_override: val, updated_at: new Date() })
        .eq('id', 1);
      showToast(val ? "Gold Override active" : "Gold Override disabled");
    } catch (err) {
      console.error(err);
      showToast("Failed to update override", true);
    }
  };

  const toggleSilverOverride = async (val) => {
    setUseSilverOverride(val);
    if (!supabaseRef.current) return;
    try {
      await supabaseRef.current
        .from('bullion_settings')
        .update({ use_silver_override: val, updated_at: new Date() })
        .eq('id', 1);
      showToast(val ? "Silver Override active" : "Silver Override disabled");
    } catch (err) {
      console.error(err);
      showToast("Failed to update override", true);
    }
  };

  // Save changes to database
  const saveAllSettings = async () => {
    if (!supabaseRef.current) return;

    setIsSaving(true);
    const supabase = supabaseRef.current;

    const payload = {
      is_active: isActive,
      gold_adjustment: parseFloat(goldAdjust) || 0,
      use_gold_override: useGoldOverride,
      override_gold: parseFloat(overrideGold) || 0,
      silver_adjustment: parseFloat(silverAdjust) || 0,
      use_silver_override: useSilverOverride,
      override_silver: parseFloat(overrideSilver) || 0,
      last_active_at: new Date(),
      updated_at: new Date()
    };

    try {
      const { error } = await supabase
        .from('bullion_settings')
        .update(payload)
        .eq('id', 1);

      if (error) throw error;
      showToast("Settings applied & live rate updated!");
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast("Failed to apply settings changes!", true);
    } finally {
      setIsSaving(false);
    }
  };

  const formatNumber = (v) => {
    if (v === null || isNaN(v)) return "---";
    return new Intl.NumberFormat('en-IN').format(Math.round(v));
  };

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return "--:--:--";
    }
  };

  // Preview monitor calculations
  const finalGoldDisplay = useGoldOverride ? overrideGold : (goldOcr ? (goldOcr + goldAdjust) : null);
  const finalSilverDisplay = useSilverOverride ? overrideSilver : (silverOcr ? (silverOcr + silverAdjust) : null);

  return (
    <>
      <header>
        <h1>CONTROL HEAD</h1>
        <p className="subtitle">Vicky Jewellery Works Command Center</p>
      </header>

      <main style={{ maxWidth: '1400px', width: '100%' }}>
        {!isAuthenticated ? (
          <div ref={lockScreenRef} className="admin-card pin-screen">
            <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 600, textAlign: 'center', fontSize: '1.35rem' }}>
              Enter Admin Passcode
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', marginTop: '-0.5rem' }}>
              Access restricted to authorized personnel
            </p>
            
            <div className="pin-dots">
              {[1, 2, 3, 4].map(idx => (
                <div key={idx} className={`pin-dot ${idx <= pinInput.length ? 'filled' : ''}`} />
              ))}
            </div>

            <div className="keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} className="keypad-btn" onClick={() => pressKey(num)}>{num}</button>
              ))}
              <button className="keypad-btn" onClick={clearPin}>C</button>
              <button className="keypad-btn" onClick={() => pressKey(0)}>0</button>
              <button className="keypad-btn" style={{ fontSize: '0.95rem', fontWeight: 'bold' }} onClick={() => verifyPin(pinInput)}>OK</button>
            </div>
            
            {loginError && <div className="error-message">Incorrect Passcode. Access Denied.</div>}
          </div>
        ) : (
          /* Grid Dashboard Layout containing separated panels */
          <div className="dashboard-grid">
            
            {/* LEFT COLUMN: Controls Panel */}
            <div className="admin-card panel-controls">
              <div className="admin-header-row">
                <div className="admin-title-group">
                  <h2>System Command</h2>
                </div>
                <button className="logout-btn" onClick={logout}>Lock Screen</button>
              </div>

              {/* Streaming Switch */}
              <div className="switch-container">
                <div className="switch-label">
                  <span className="switch-title">Live Rate Streaming</span>
                  <span className="switch-subtext">Toggle customer display on/off</span>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={isActive} 
                    onChange={(e) => toggleActiveState(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              {/* GOLD CONTROLS PANEL */}
              <div className="metal-control-section gold-section">
                <div className="section-title">
                  <span>GOLD 995 (100G) ADJUST</span>
                  <span>👑</span>
                </div>

                <div className="stepper-container" style={{ opacity: useGoldOverride ? 0.4 : 1 }}>
                  <label>Adjust Rate (₹ / 10gm)</label>
                  <div className="stepper-row">
                    <input 
                      type="number" 
                      value={goldAdjust} 
                      disabled={useGoldOverride}
                      onChange={(e) => setGoldAdjust(parseFloat(e.target.value) || 0)} 
                    />
                  </div>
                  <div className="stepper-btn-group">
                    {[-100, -50, -10, 10, 50, 100].map(amount => (
                      <button 
                        key={amount} 
                        disabled={useGoldOverride}
                        className={`step-btn ${amount < 0 ? 'minus' : 'plus'}`} 
                        onClick={() => setGoldAdjust(prev => prev + amount)}
                      >
                        {amount >= 0 ? `+${amount}` : amount}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="override-container">
                  <div className="override-row">
                    <span className="override-label">Set Fixed Override Price</span>
                    <label className="switch" style={{ width: '44px', height: '26px' }}>
                      <input 
                        type="checkbox" 
                        checked={useGoldOverride} 
                        onChange={(e) => toggleGoldOverride(e.target.checked)} 
                      />
                      <span className="slider" style={{ borderRadius: '26px' }}></span>
                    </label>
                  </div>
                  {useGoldOverride && (
                    <div className="stepper-container">
                      <label>Fixed Price Value (INR)</label>
                      <input 
                        type="number" 
                        value={overrideGold} 
                        onChange={(e) => setOverrideGold(parseFloat(e.target.value) || 0)} 
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SILVER CONTROLS PANEL */}
              <div className="metal-control-section silver-section">
                <div className="section-title">
                  <span>SILVER 999 (1KG) ADJUST</span>
                  <span>🥈</span>
                </div>

                <div className="stepper-container" style={{ opacity: useSilverOverride ? 0.4 : 1 }}>
                  <label>Adjust Rate (₹ / 1kg)</label>
                  <div className="stepper-row">
                    <input 
                      type="number" 
                      value={silverAdjust} 
                      disabled={useSilverOverride}
                      onChange={(e) => setSilverAdjust(parseFloat(e.target.value) || 0)} 
                    />
                  </div>
                  <div className="stepper-btn-group">
                    {[-200, -100, -50, 50, 100, 200].map(amount => (
                      <button 
                        key={amount} 
                        disabled={useSilverOverride}
                        className={`step-btn ${amount < 0 ? 'minus' : 'plus'}`} 
                        onClick={() => setSilverAdjust(prev => prev + amount)}
                      >
                        {amount >= 0 ? `+${amount}` : amount}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="override-container">
                  <div className="override-row">
                    <span className="override-label">Set Fixed Override Price</span>
                    <label className="switch" style={{ width: '44px', height: '26px' }}>
                      <input 
                        type="checkbox" 
                        checked={useSilverOverride} 
                        onChange={(e) => toggleSilverOverride(e.target.checked)} 
                      />
                      <span className="slider" style={{ borderRadius: '26px' }}></span>
                    </label>
                  </div>
                  {useSilverOverride && (
                    <div className="stepper-container">
                      <label>Fixed Price Value (INR)</label>
                      <input 
                        type="number" 
                        value={overrideSilver} 
                        onChange={(e) => setOverrideSilver(parseFloat(e.target.value) || 0)} 
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="save-row">
                <button 
                  className="btn" 
                  disabled={isSaving} 
                  onClick={saveAllSettings}
                >
                  {isSaving ? "Publishing Changes..." : "Publish Changes Live"}
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: Dedicated Live Feeds & Price Logs Panel */}
            <div className="dashboard-column display-panels">
              
              {/* GOLD DEDICATED MONITOR & HISTORY PANEL */}
              <div className="admin-card monitor-panel gold-border-highlight">
                <div className="panel-header">
                  <h3 className="gold-text">👑 GOLD LIVE RATE STREAM</h3>
                  <span className={`live-status-dot ${isActive ? 'green' : 'red'}`}></span>
                </div>

                <div className="live-monitor-value">
                  {isActive && <span className="currency-symbol">₹</span>}
                  <span className="current-rate-val">{isActive ? formatNumber(finalGoldDisplay) : "CLOSED"}</span>
                </div>

                <div className="live-monitor">
                  <div className="monitor-row">
                    <span>OCR Screen Price:</span>
                    <span style={{ fontWeight: '500', color: '#f8fafc' }}>
                      {goldOcr ? `₹${formatNumber(goldOcr)}` : "Waiting for Screen Feed..."}
                    </span>
                  </div>
                  {!useGoldOverride && (
                    <div className="monitor-row">
                      <span>Formula Offset:</span>
                      <span style={{ fontWeight: '500', color: goldAdjust >= 0 ? '#4ade80' : '#f87171' }}>
                        ₹{goldAdjust >= 0 ? '+' : ''}{formatNumber(goldAdjust)}
                      </span>
                    </div>
                  )}
                  {useGoldOverride && (
                    <div className="monitor-row">
                      <span>System Mode:</span>
                      <span style={{ fontWeight: '600', color: 'var(--gold-primary)' }}>MANUAL OVERRIDE</span>
                    </div>
                  )}
                </div>

                {/* Live Previous Prices refreshing log */}
                <div className="history-panel">
                  <h4 className="history-title">Recent Price Logs</h4>
                  <div className="history-list">
                    {goldHistory.length === 0 ? (
                      <div className="history-empty">No updates recorded yet.</div>
                    ) : (
                      goldHistory.map((row) => (
                        <div key={row.id} className="history-row">
                          <span className="history-price">₹{formatNumber(row.price)}</span>
                          <span className="history-badge">
                            {row.raw_text && row.raw_text.includes("Override") ? "Override" : "Live"}
                          </span>
                          <span className="history-time">{formatTime(row.created_at)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* SILVER DEDICATED MONITOR & HISTORY PANEL */}
              <div className="admin-card monitor-panel silver-border-highlight">
                <div className="panel-header">
                  <h3 className="silver-text">🥈 SILVER LIVE RATE STREAM</h3>
                  <span className={`live-status-dot ${isActive ? 'green' : 'red'}`}></span>
                </div>

                <div className="live-monitor-value">
                  {isActive && <span className="currency-symbol">₹</span>}
                  <span className="current-rate-val">{isActive ? formatNumber(finalSilverDisplay) : "CLOSED"}</span>
                </div>

                <div className="live-monitor">
                  <div className="monitor-row">
                    <span>OCR Screen Price:</span>
                    <span style={{ fontWeight: '500', color: '#f8fafc' }}>
                      {silverOcr ? `₹${formatNumber(silverOcr)}` : "Waiting for Screen Feed..."}
                    </span>
                  </div>
                  {!useSilverOverride && (
                    <div className="monitor-row">
                      <span>Formula Offset:</span>
                      <span style={{ fontWeight: '500', color: silverAdjust >= 0 ? '#4ade80' : '#f87171' }}>
                        ₹{silverAdjust >= 0 ? '+' : ''}{formatNumber(silverAdjust)}
                      </span>
                    </div>
                  )}
                  {useSilverOverride && (
                    <div className="monitor-row">
                      <span>System Mode:</span>
                      <span style={{ fontWeight: '600', color: '#cbd5e1' }}>MANUAL OVERRIDE</span>
                    </div>
                  )}
                </div>

                {/* Live Previous Prices refreshing log */}
                <div className="history-panel">
                  <h4 className="history-title">Recent Price Logs</h4>
                  <div className="history-list">
                    {silverHistory.length === 0 ? (
                      <div className="history-empty">No updates recorded yet.</div>
                    ) : (
                      silverHistory.map((row) => (
                        <div key={row.id} className="history-row">
                          <span className="history-price">₹{formatNumber(row.price)}</span>
                          <span className="history-badge">
                            {row.raw_text && row.raw_text.includes("Override") ? "Override" : "Live"}
                          </span>
                          <span className="history-time">{formatTime(row.created_at)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}
      </main>

      <div className={`toast ${toast.show ? 'show' : ''}`} style={{ background: toast.isError ? '#ef4444' : '#10b981' }}>
        {toast.message}
      </div>

      <footer>
        <p>Admin Command System connected. Verify laptop agent loop is active.</p>
      </footer>
    </>
  );
}
