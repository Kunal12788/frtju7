import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const TEMP_SUPABASE_URL = import.meta.env.VITE_TEMP_SUPABASE_URL;
const TEMP_SUPABASE_ANON_KEY = import.meta.env.VITE_TEMP_SUPABASE_ANON_KEY;

export default function PendingCustomersPanel({ mainSupabase }) {
  const [customerList, setCustomerList] = useState([]);
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
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      if (!registrationSupabase) return;

      const { data, error } = await registrationSupabase
        .from('pending_whatsapp_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomerList(data || []);
    } catch (err) {
      console.error('Failed to fetch registration entries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyDetails = (customer) => {
    const textToCopy = `Name: ${customer.contact_name}\nPhone: ${customer.phone_number}\nShop: ${customer.shop_name || 'N/A'}\nAddress: ${customer.address || 'N/A'}\nLanguage: ${customer.preferred_language || 'english'}`;
    
    navigator.clipboard.writeText(textToCopy);
    showToast(`Copied details for ${customer.contact_name} to clipboard!`);
  };

  const handleDelete = async (customer) => {
    if (!window.confirm(`Are you sure you want to delete the entry for ${customer.contact_name}?`)) return;

    try {
      setProcessingId(customer.id);
      if (registrationSupabase) {
        const { error } = await registrationSupabase
          .from('pending_whatsapp_subscriptions')
          .delete()
          .eq('id', customer.id);

        if (error) throw error;
      }

      showToast(`Deleted registration for ${customer.contact_name}.`);
      fetchCustomers();
    } catch (err) {
      console.error('Deletion failed:', err);
      showToast('Failed to delete entry.', true);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="admin-card panel-controls" style={{ width: '100%' }}>
      <div className="admin-header-row" style={{ marginBottom: '20px' }}>
        <div className="admin-title-group">
          <h2>Registered WhatsApp Customers (Project B)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            View customer details submitted via the signup page. They are stored isolated in Project B and never automatically added to your main database.
          </p>
        </div>
        <button 
          onClick={fetchCustomers} 
          className="btn" 
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: '#fff' }}
        >
          🔄 Refresh List
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading registered customers...
        </div>
      ) : customerList.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px', 
          background: 'var(--bg-surface)', 
          borderRadius: '12px', 
          border: '1px solid var(--border)', 
          color: 'var(--text-secondary)' 
        }}>
          ✨ No entries in Project B registration database yet. Customer signups will appear here!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px', width: '100%' }}>
          {customerList.map(c => (
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
                    background: 'rgba(212, 175, 55, 0.15)', 
                    border: '1px solid rgba(212, 175, 55, 0.4)', 
                    color: '#d4af37', 
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
                  <div>📅 Date: {new Date(c.created_at).toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleCopyDetails(c)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: '#fff',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  📋 Copy Info
                </button>
                <button
                  onClick={() => handleDelete(c)}
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
                  {processingId === c.id ? 'Deleting...' : 'Delete'}
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
