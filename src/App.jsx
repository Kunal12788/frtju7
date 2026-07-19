import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import ServicesPanel from './ServicesPanel';
import PendingCustomersPanel from './PendingCustomersPanel';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; 
const SUPABASE_WRITE_KEY = import.meta.env.VITE_SUPABASE_KEY;  

// Passcode PIN (Default: 2580)
const ADMIN_PIN = "2580";
const MAX_PIN_LENGTH = 4;

export default function App() {
  const [activeTab, setActiveTab] = useState('rates');
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMfaRequired, setIsMfaRequired] = useState(false);
  const [mfaQrCode, setMfaQrCode] = useState(null);
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  const lockScreenRef = useRef(null);

  // Settings Controls State (What the user configures in UI)
  const [isActive, setIsActive] = useState(true);
  const [goldAdjust, setGoldAdjust] = useState(0);
  const [useGoldOverride, setUseGoldOverride] = useState(false);
  const [overrideGold, setOverrideGold] = useState(0);
  const [silverAdjust, setSilverAdjust] = useState(0);
  const [useSilverOverride, setUseSilverOverride] = useState(false);
  const [overrideSilver, setOverrideSilver] = useState(0);
  const [marketClosedReason, setMarketClosedReason] = useState('default');
  
  // Advertisement State
  const [showAdvertisement, setShowAdvertisement] = useState(false);
  const [advertisementUrl, setAdvertisementUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Live Live Price Stats (What is active in the DB right now)
  const [goldOcr, setGoldOcr] = useState(null);
  const [silverOcr, setSilverOcr] = useState(null);
  const [goldHistory, setGoldHistory] = useState([]);
  const [silverHistory, setSilverHistory] = useState([]);

  // UI Actions State
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", isError: false });
  const supabaseRef = useRef(null);
  const authClientRef = useRef(null);
  const lastUpdatedAtRef = useRef(null);

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
      // Initialize DB client (never signs in, remains service_role to bypass RLS)
      supabaseRef.current = createClient(SUPABASE_URL, SUPABASE_WRITE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
      // Initialize Auth client (used exclusively for login/session state)
      authClientRef.current = createClient(SUPABASE_URL, SUPABASE_WRITE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
    }
  }, []);

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 2500);
  };

  // Sign In with Email/Password
  const handleSignIn = async (e) => {
    if (e) e.preventDefault();
    setAuthError("");
    setIsAuthLoading(true);
    try {
      const { data, error } = await authClientRef.current.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      await checkMfa(data.user);
    } catch (err) {
      console.error(err);
      setAuthError(err.message || "Invalid credentials");
      setIsAuthLoading(false);
      triggerShake();
    }
  };

  // Check MFA & Enroll or Challenge
  const checkMfa = async (user) => {
    try {
      const { data: factors, error: factorsErr } = await authClientRef.current.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;

      // Self-healing: Delete any stuck, unverified TOTP factors to prevent duplicate enrollment errors
      const unverifiedFactors = factors?.all?.filter(f => f.status === 'unverified') || [];
      for (const f of unverifiedFactors) {
        try {
          await authClientRef.current.auth.mfa.unenroll({ factorId: f.id });
        } catch (unenrollErr) {
          console.warn("Failed to unenroll unverified factor:", unenrollErr);
        }
      }

      // Re-fetch factors after clean-up
      const { data: cleanFactors } = await authClientRef.current.auth.mfa.listFactors();
      const enrolledFactors = cleanFactors?.all?.filter(f => f.status === 'verified') || [];

      if (enrolledFactors.length > 0) {
        // Enrolled: Create authentication challenge
        const factor = enrolledFactors[0];
        setMfaFactorId(factor.id);

        const { data: challenge, error: challengeErr } = await authClientRef.current.auth.mfa.challenge({
          factorId: factor.id
        });
        if (challengeErr) throw challengeErr;

        setMfaChallengeId(challenge.id);
        setIsMfaRequired(true);
        setIsAuthLoading(false);
      } else {
        // Not Enrolled: Start Google Authenticator setup enrollment
        const { data: enrollData, error: enrollErr } = await authClientRef.current.auth.mfa.enroll({
          factorType: 'totp',
          issuer: 'Vicky Jewellery Works',
          friendlyName: 'Vicky Admin'
        });
        if (enrollErr) throw enrollErr;

        setMfaFactorId(enrollData.id);
        setMfaQrCode(enrollData.totp.qr_code);
        setMfaSecret(enrollData.totp.secret);

        // Challenge for the initial enrollment verification
        const { data: challenge, error: challengeErr } = await authClientRef.current.auth.mfa.challenge({
          factorId: enrollData.id
        });
        if (challengeErr) throw challengeErr;

        setMfaChallengeId(challenge.id);
        setIsMfaRequired(true);
        setIsAuthLoading(false);
      }
    } catch (err) {
      console.error(err);
      setAuthError("Failed to initiate authenticator verification: " + err.message);
      setIsAuthLoading(false);
    }
  };

  // Verify code from Google Authenticator
  const handleVerifyMfa = async (e) => {
    if (e) e.preventDefault();
    setAuthError("");
    setIsAuthLoading(true);
    try {
      const { data, error } = await authClientRef.current.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code: mfaCode
      });
      if (error) throw error;

      // Access granted!
      setIsAuthenticated(true);
      setIsMfaRequired(false);
      showToast("Access Authorized!");
    } catch (err) {
      console.error(err);
      setAuthError(err.message || "Invalid OTP Code. Please try again.");
      triggerShake();
    } finally {
      setIsAuthLoading(false);
    }
  };

  const triggerShake = () => {
    if (lockScreenRef.current) {
      lockScreenRef.current.style.animation = "shake 0.3s ease";
      setTimeout(() => {
        if (lockScreenRef.current) lockScreenRef.current.style.animation = "";
      }, 300);
    }
  };

  const logout = async () => {
    if (authClientRef.current) {
      await authClientRef.current.auth.signOut();
    }
    setIsAuthenticated(false);
    setIsMfaRequired(false);
    setMfaQrCode(null);
    setMfaCode("");
    setEmail("");
    setPassword("");
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
          lastUpdatedAtRef.current = settings.updated_at;
          setIsActive(settings.is_active);
          setGoldAdjust(parseFloat(settings.gold_adjustment) || 0);
          setUseGoldOverride(settings.use_gold_override);
          setOverrideGold(parseFloat(settings.override_gold) || 0);
          setSilverAdjust(parseFloat(settings.silver_adjustment) || 0);
          setUseSilverOverride(settings.use_silver_override);
          setOverrideSilver(parseFloat(settings.override_silver) || 0);
          setMarketClosedReason(settings.market_closed_reason || 'default');
          setShowAdvertisement(settings.show_advertisement || false);
          setAdvertisementUrl(settings.advertisement_url || "");

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
        
        // Ignore updates if updated_at did not change (heartbeats)
        if (lastUpdatedAtRef.current && row.updated_at === lastUpdatedAtRef.current) {
          return;
        }
        
        lastUpdatedAtRef.current = row.updated_at;
        setIsActive(row.is_active);
        setGoldAdjust(row.gold_adjustment);
        setUseGoldOverride(row.use_gold_override);
        setOverrideGold(row.override_gold);
        setSilverAdjust(row.silver_adjustment);
        setUseSilverOverride(row.use_silver_override);
        setOverrideSilver(row.override_silver);
        setMarketClosedReason(row.market_closed_reason || 'default');
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
      const { error } = await supabaseRef.current
        .from('bullion_settings')
        .update({ is_active: val, updated_at: new Date() })
        .eq('id', 1);
      
      if (error) throw error;
      
      showToast(val ? "Live streaming turned ON" : "Live streaming turned OFF");
    } catch (err) {
      console.error(err);
      showToast("Failed to update status in Database: " + (err.message || "Permissions error"), true);
      // Revert UI state on failure
      setIsActive(!val);
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
      market_closed_reason: marketClosedReason,
      show_advertisement: showAdvertisement,
      advertisement_url: advertisementUrl,
      last_active_at: new Date(),
      updated_at: new Date()
    };

    try {
      const { error } = await supabase
        .from('bullion_settings')
        .update(payload)
        .eq('id', 1);

      if (error) throw error;
      
      // The local agent (in_memory_agent.py) monitors settings and handles rates updates/push notifications cleanly.
      
      try {
        const { data: latestGoldData } = await supabase
          .from('bullion_rates')
          .select('*')
          .in('item', ['gold_995_100gms', 'gold-24k-100g'])
          .order('created_at', { ascending: false })
          .limit(1);
          
        let rawGold = 0;
        let lastGoldRow = null;
        if (latestGoldData && latestGoldData.length > 0) {
          lastGoldRow = latestGoldData[0];
          const match = lastGoldRow.raw_text && lastGoldRow.raw_text.match(/OCR Raw:\s*([\d.]+)/);
          rawGold = match ? parseFloat(match[1]) : lastGoldRow.price;
        }

        const { data: latestSilverData } = await supabase
          .from('bullion_rates')
          .select('*')
          .in('item', ['silver_999_1kg', 'silver-999-1kg'])
          .order('created_at', { ascending: false })
          .limit(1);
          
        let rawSilver = 0;
        let lastSilverRow = null;
        if (latestSilverData && latestSilverData.length > 0) {
          lastSilverRow = latestSilverData[0];
          const match = lastSilverRow.raw_text && lastSilverRow.raw_text.match(/OCR Raw:\s*([\d.]+)/);
          rawSilver = match ? parseFloat(match[1]) : lastSilverRow.price;
        }

        const newRows = [];
        if (lastGoldRow) {
          const finalGold = payload.use_gold_override ? payload.override_gold : (rawGold + payload.gold_adjustment);
          newRows.push({
            item: lastGoldRow.item,
            label: lastGoldRow.label,
            price: finalGold,
            unit: lastGoldRow.unit,
            raw_text: payload.use_gold_override ? "Admin Manual Override" : `OCR Raw: ${rawGold} | Adjusted by: ${payload.gold_adjustment > 0 ? '+' : ''}${payload.gold_adjustment}`
          });
        }
        if (lastSilverRow) {
          const finalSilver = payload.use_silver_override ? payload.override_silver : (rawSilver + payload.silver_adjustment);
          newRows.push({
            item: lastSilverRow.item,
            label: lastSilverRow.label,
            price: finalSilver,
            unit: lastSilverRow.unit,
            raw_text: payload.use_silver_override ? "Admin Manual Override" : `OCR Raw: ${rawSilver} | Adjusted by: ${payload.silver_adjustment > 0 ? '+' : ''}${payload.silver_adjustment}`
          });
        }

        if (newRows.length > 0) {
          await supabase.from('bullion_rates').insert(newRows);
        }
      } catch (insertErr) {
        console.error("Failed to push instant rate update:", insertErr);
      }

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

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!supabaseRef.current) return;
    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;

    try {
      const { error: uploadError } = await supabaseRef.current.storage
        .from('ads')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabaseRef.current.storage
        .from('ads')
        .getPublicUrl(fileName);

      setAdvertisementUrl(data.publicUrl);
      showToast("Media uploaded successfully. Remember to publish changes!");
    } catch (error) {
      console.error(error);
      showToast("Failed to upload media.", true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearAd = async () => {
    setAdvertisementUrl("");
    setShowAdvertisement(false);
    showToast("Advertisement cleared. Remember to publish changes!");
  };

  return (
    <>
      <header>
        <h1>CONTROL HEAD</h1>
        <p className="subtitle">Vicky Jewellery Works Command Center</p>
      </header>

      <main style={{ maxWidth: '1400px', width: '100%' }}>
        {!isAuthenticated ? (
          <div ref={lockScreenRef} className="admin-card pin-screen">
            <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 600, textAlign: 'center', fontSize: '1.35rem', marginBottom: '0.5rem' }}>
              Vicky Jewellery Works
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
              {isMfaRequired ? "Google Authenticator MFA Challenge" : "Sign In to Admin Command"}
            </p>

            {/* Step A: Email/Password Form */}
            {!isMfaRequired && (
              <form className="login-form" onSubmit={handleSignIn}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="admin@vickyjewellers.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    required 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)} 
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={isAuthLoading}>
                  {isAuthLoading ? "Authenticating..." : "Sign In"}
                </button>
              </form>
            )}

            {/* Step B: Google Authenticator Verification */}
            {isMfaRequired && (
              <form className="mfa-form" onSubmit={handleVerifyMfa}>
                {mfaQrCode && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <div className="mfa-instructions">
                      Open your Google Authenticator app, scan this QR code, and enter the verification code below.
                    </div>
                    <div className="qr-code-svg">
                      <img src={mfaQrCode} alt="MFA QR Code" style={{ width: '100%', height: '100%', display: 'block', borderRadius: '8px' }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontFamily: 'monospace' }}>
                      Secret: {mfaSecret}
                    </div>
                  </div>
                )}
                
                {!mfaQrCode && (
                  <div className="mfa-instructions" style={{ textAlign: 'center' }}>
                    Enter the 6-digit verification code from your Google Authenticator phone app.
                  </div>
                )}

                <div className="form-group" style={{ textAlign: 'center' }}>
                  <label style={{ display: 'block', textAlign: 'center' }}>Authenticator Code</label>
                  <input 
                    type="text" 
                    required 
                    maxLength={6}
                    placeholder="000000"
                    style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5em', fontWeight: 'bold' }}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} 
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={isAuthLoading}>
                  {isAuthLoading ? "Verifying..." : "Verify & Complete Login"}
                </button>
                <button 
                  type="button" 
                  className="logout-btn" 
                  style={{ marginTop: '1rem', width: '100%', borderColor: 'transparent' }} 
                  onClick={logout}
                >
                  Cancel & Sign Out
                </button>
              </form>
            )}

            {authError && <div className="error-message" style={{ marginTop: '1rem' }}>{authError}</div>}
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setActiveTab('rates')} 
                className={`btn ${activeTab === 'rates' ? 'btn-primary' : ''}`}
                style={{ background: activeTab === 'rates' ? 'var(--gold-primary)' : 'var(--bg-elevated)', color: activeTab === 'rates' ? '#000' : 'white', minWidth: '150px' }}
              >
                Live Rates Monitor
              </button>
              <button 
                onClick={() => setActiveTab('whatsapp')} 
                className={`btn ${activeTab === 'whatsapp' ? 'btn-primary' : ''}`}
                style={{ background: activeTab === 'whatsapp' ? 'var(--gold-primary)' : 'var(--bg-elevated)', color: activeTab === 'whatsapp' ? '#000' : 'white', minWidth: '150px' }}
              >
                Pending WhatsApp Signups
              </button>
              <button 
                onClick={() => setActiveTab('services')} 
                className={`btn ${activeTab === 'services' ? 'btn-primary' : ''}`}
                style={{ background: activeTab === 'services' ? 'var(--gold-primary)' : 'var(--bg-elevated)', color: activeTab === 'services' ? '#000' : 'white', minWidth: '150px' }}
              >
                Services Directory
              </button>
            </div>

            {activeTab === 'services' ? (
              <ServicesPanel supabase={supabaseRef.current} />
            ) : activeTab === 'whatsapp' ? (
              <PendingCustomersPanel mainSupabase={supabaseRef.current} />
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

              {/* Market Closed Reason Selector */}
              {!isActive && (
                <div className="reason-selector-container" style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Reason for closing the market:
                  </div>
                  <select 
                    value={marketClosedReason}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMarketClosedReason(val);
                      // Auto-save the reason to DB for instant reflection on customer screens
                      if (supabaseRef.current) {
                        supabaseRef.current.from('bullion_settings')
                          .update({ market_closed_reason: val, updated_at: new Date() })
                          .eq('id', 1)
                          .then(({ error }) => {
                            if (error) {
                              console.error("DB Error:", error);
                              showToast("Database Error: " + error.message, true);
                            } else {
                              showToast("Reason updated live!");
                            }
                          });
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="default">Standard "Market Closed" Message</option>
                    <option value="good_night">🌙 Good Night Message</option>
                  </select>
                </div>
              )}

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

              {/* ADVERTISEMENT CONTROL PANEL */}
              <div className="metal-control-section" style={{ borderLeftColor: '#8b5cf6' }}>
                <div className="section-title">
                  <span>PROMOTIONAL SCREEN</span>
                  <span>🎉</span>
                </div>

                <div className="override-container">
                  <div className="override-row">
                    <span className="override-label">Show Advertisement Overlay</span>
                    <label className="switch" style={{ width: '44px', height: '26px' }}>
                      <input 
                        type="checkbox" 
                        checked={showAdvertisement} 
                        onChange={(e) => setShowAdvertisement(e.target.checked)} 
                      />
                      <span className="slider" style={{ borderRadius: '26px' }}></span>
                    </label>
                  </div>
                  <div className="stepper-container" style={{ marginTop: '16px' }}>
                    <label>Upload Offer / Ad Image</label>
                    <input 
                      type="file" 
                      accept="image/*,video/*"
                      onChange={handleFileUpload} 
                      disabled={isUploading}
                      style={{ marginTop: '8px', marginBottom: '12px' }}
                    />
                    {isUploading && <span style={{ color: '#8b5cf6', fontSize: '14px' }}>Uploading...</span>}
                    {advertisementUrl && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>Current Ad Media:</div>
                        {advertisementUrl.match(/\.(mp4|webm|ogg)(\?.*)?$/i) ? (
                          <video src={advertisementUrl} style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px' }} controls />
                        ) : (
                          <img src={advertisementUrl} alt="Ad" style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px' }} />
                        )}
                        <div style={{ marginTop: '8px' }}>
                          <button className="step-btn minus" onClick={handleClearAd} style={{ padding: '6px 12px', fontSize: '13px' }}>Clear Media</button>
                        </div>
                      </div>
                    )}
                  </div>
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
