import React, { useState, useEffect } from 'react';

export default function ServicesPanel({ supabase }) {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    work_type: '',
    address: '',
    mobile_number: ''
  });

  const [toast, setToast] = useState({ show: false, message: '', isError: false });

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 2500);
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('services_directory')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setServices(data || []);
    } catch (err) {
      console.error("Failed to fetch services", err);
      // Don't show toast on initial load error just in case table isn't created yet
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEdit = (service) => {
    setFormData(service);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this service provider?")) return;
    
    try {
      const { error } = await supabase
        .from('services_directory')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      showToast("Service provider deleted!");
      fetchServices();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete", true);
    }
  };

  const resetForm = () => {
    setFormData({ id: null, name: '', work_type: '', address: '', mobile_number: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const payload = {
        name: formData.name,
        work_type: formData.work_type,
        address: formData.address,
        mobile_number: formData.mobile_number
      };
      
      if (formData.id) {
        // Update
        const { error } = await supabase
          .from('services_directory')
          .update(payload)
          .eq('id', formData.id);
          
        if (error) throw error;
        showToast("Service provider updated!");
      } else {
        // Insert
        const { error } = await supabase
          .from('services_directory')
          .insert([payload]);
          
        if (error) throw error;
        showToast("Service provider added!");
      }
      
      resetForm();
      fetchServices();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to save", true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-card panel-controls" style={{ width: '100%' }}>
      <div className="admin-header-row">
        <div className="admin-title-group">
          <h2>Services Directory</h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginTop: '10px' }}>
        
        {/* FORM PANEL */}
        <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--gold-primary)' }}>
            {formData.id ? "Edit Service Provider" : "Add New Provider"}
          </h3>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Business / Provider Name</label>
              <input 
                type="text" 
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required 
                placeholder="e.g. Ramesh Gold Testing"
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Work Type</label>
              <input 
                type="text" 
                name="work_type"
                value={formData.work_type}
                onChange={handleInputChange}
                required 
                placeholder="e.g. Testing, Refining, Artisan"
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Address</label>
              <textarea 
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                required 
                placeholder="e.g. Shop 12, Zaveri Bazaar"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'white', minHeight: '60px', fontFamily: 'inherit' }}
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Mobile Number (For Call & WhatsApp)</label>
              <input 
                type="text" 
                name="mobile_number"
                value={formData.mobile_number}
                onChange={handleInputChange}
                required 
                placeholder="e.g. +91 9876543210"
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="submit" className="btn-primary" disabled={isSaving} style={{ flex: 1 }}>
                {isSaving ? "Saving..." : (formData.id ? "Update" : "Add Provider")}
              </button>
              {formData.id && (
                <button type="button" onClick={resetForm} className="btn" style={{ padding: '0 15px', background: 'var(--bg-elevated)' }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* LIST PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--text-secondary)' }}>Current Directory</h3>
          
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : services.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              No service providers found. Add one from the left.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px', overflowY: 'auto', maxHeight: '500px', paddingRight: '5px' }}>
              {services.map(s => (
                <div key={s.id} style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '16px' }}>{s.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gold-primary)', marginBottom: '6px', fontWeight: '500' }}>{s.work_type}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>📍 {s.address}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>📞 {s.mobile_number}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEdit(s)} style={{ padding: '6px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => handleDelete(s.id)} style={{ padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>

      {toast.show && (
        <div className={`toast ${toast.isError ? 'error' : ''}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
