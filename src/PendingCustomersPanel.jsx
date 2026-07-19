import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const TEMP_SUPABASE_URL = import.meta.env.VITE_TEMP_SUPABASE_URL;
const TEMP_SUPABASE_ANON_KEY = import.meta.env.VITE_TEMP_SUPABASE_ANON_KEY;

export default function PendingCustomersPanel({ mainSupabase }) {
  const [pendingList, setPendingList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', isError: false });

  // Initialize Project B (Registration DB) client or fallback to main DB client
  const [registrationSupabase] = useState(() => {
    if (TEMP_SUPABASE_URL && TEMP_SUPABASE_ANON_KEY) {
      try {
        return createClient(TEMP_SUPABASE_URL, TEMP_SUPABASE_ANON_KEY, {
          auth: { persistSession: false }
        });
      } catch (err) {
        console.warn('Failed to init registration Supabase client:', err);
      }
    }
    return mainSupabase;
  });

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  useEffect(() => {
    fetchPendingCustomers();
  }, []);

  const fetchPendingCustomers = async () => {
    try {
      setIsLoading(true);
      if (!registrationSupabase) return;

      const { data, error } = await registrationSupabase
        .from('pending_whatsapp_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingList(data || []);
    } catch (err) {
      console.error('Failed to fetch pending WhatsApp customers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (customer) => {
    try {
      setProcessingId(customer.id);

      // 1. Insert into Main Database (Project A) active customers table
      if (mainSupabase) {
        const { error: insertError } = await mainSupabase
          .from('bullion_whatsapp_customers')
          .insert([{
            contact_name: customer.contact_name,
            phone_number: customer.phone_number,
            shop_name: customer.shop_name || '',
            address: customer.address || '',
            preferred_language: customer.preferred_language || 'english',
            priority: 'medium',
            is_active: true
          }]);

        if (insertError) throw insertError;
      }

      // 2. Delete from Pending Database (Project B)
      if (registrationSupabase) {
        const { error: deleteError } = await registrationSupabase
          .from('pending_whatsapp_subscriptions')
          .delete()
          .eq('id', customer.id);

        if (deleteError) console.warn('Could not delete from pending table:', deleteError);
      }

      showToast(`Approved ${customer.contact_name}! Live rate alerts activated.`);
      fetchPendingCustomers();
    } catch (err) {
      console.error('Approval failed:', err);
      showToast(err.message || 'Failed to approve customer.', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (customer) => {
    if (!window.confirm(`Are you sure you want to reject and remove ${customer.contact_name}?`)) return;

    try {
      setProcessingId(customer.id);
      if (registrationSupabase) {
        const { error } = await registrationSupabase
          .from('pending_whatsapp_subscriptions')
          .delete()
          .eq('id', customer.id);

        if (error) throw error;
      }

      showToast(`Removed registration for ${customer.contact_name}.`);
      fetchPendingCustomers();
    } catch (err) {
      console.error('Rejection failed:', err);
      showToast('Failed to remove pending registration.', true);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="admin-card panel-controls" style={{ width: '100%' }}>
      <div className="admin-header-row" style={{ marginBottom: '20px' }}>
        <div className="admin-title-group">
          <h2>Pending WhatsApp Customer Approvals</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Review new customer signups. Approved customers will immediately start receiving automated WhatsApp rate updates & greetings.
          </p>
        </div>
        <button 
          onClick={fetchPendingCustomers} 
          className="btn" 
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: '#fff' }}
        >
          🔄 Refresh List
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading pending customer requests...
        </div>
      ) : pendingList.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px', 
          background: 'var(--bg-surface)', 
          borderRadius: '12px', 
          border: '1px solid var(--border)', 
          color: 'var(--text-secondary)' 
        }}>
          ✨ No pending WhatsApp registration requests. New customer signups will appear here automatically!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px', width: '100%' }}>
          {pendingList.map(c => (
            <div 
              key={c.id} 
              style={{ 
                background: 'var(--bg-surface)', 
                padding: '18px 20px', 
                borderRadius: '14px', 
                border: '1px solid var(--border)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '15px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.1rem' }}>{c.contact_name}</span>
                  <span style={{ 
                    background: 'rgba(37, 211, 102, 0.15)', 
                    border: '1px solid rgba(37, 211, 102, 0.4)', 
                    color: '#25D366', 
                    padding: '2px 8px', 
                    borderRadius: '12px', 
                    fontSize: '11px', 
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                  }}>
                    {c.preferred_language || 'english'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <div>📞 <strong style={{ color: '#fff' }}>{c.phone_number}</strong></div>
                  {c.shop_name && <div>🏪 Shop: <strong style={{ color: 'var(--gold-primary)' }}>{c.shop_name}</strong></div>}
                  {c.address && <div>📍 {c.address}</div>}
                  <div>📅 Registered: {new Date(c.created_at).toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleApprove(c)}
                  disabled={processingId === c.id}
                  style={{
                    background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(37, 211, 102, 0.3)'
                  }}
                >
                  {processingId === c.id ? 'Approving...' : '✓ Approve & Activate'}
                </button>
                <button
                  onClick={() => handleReject(c)}
                  disabled={processingId === c.id}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast.show && (
        <div className={`toast ${toast.isError ? 'error' : ''}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
