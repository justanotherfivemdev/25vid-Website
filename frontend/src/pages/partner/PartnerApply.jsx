import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Shield, CheckCircle, ArrowLeft } from 'lucide-react';
import { BACKEND_URL, API } from '@/utils/api';

const PartnerApply = () => {
  const [form, setForm] = useState({
    unit_name: '',
    unit_timezone: '',
    member_count: 1,
    description: '',
    primary_tasking: '',
    contact_email: '',
    contact_name: '',
    additional_info: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'member_count' ? parseInt(value, 10) || 1 : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.unit_name.trim() || !form.contact_email.trim()) {
      setError('Unit Name and Contact Email are required.');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/partner-applications`, form);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-16 h-16 mx-auto object-contain opacity-80" />
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            APPLICATION SUBMITTED
          </h2>
          <p className="text-gray-400 text-sm">
            Your partner unit application for <span className="text-white font-semibold">{form.unit_name}</span> has been received.
            An S-5 Liaison officer will review it shortly.
          </p>
          <div className="space-y-3 pt-4">
            <Link to="/partner-login" className="text-sm text-tropic-olive hover:text-tropic-gold transition-colors block">
              Already have an invite? Partner Login →
            </Link>
            <Link to="/" className="text-sm text-gray-500 hover:text-tropic-gold transition-colors block">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-3">
          <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-14 h-14 mx-auto object-contain opacity-80" />
          <h1 className="text-2xl font-bold text-tropic-gold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            PARTNER UNIT APPLICATION
          </h1>
          <p className="text-xs text-tropic-olive tracking-widest">S-5 LIAISON — ALLIED UNIT ENROLLMENT</p>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Apply to become an allied partner unit of the 25th Infantry Division. All applications are reviewed by S-5 Liaison personnel.
          </p>
        </div>

        <Card className="bg-gray-900/90 border-tropic-olive/30">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-tropic-red/10 border border-tropic-red/30 rounded p-3 text-sm text-tropic-red-light">
                  {error}
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 block mb-1">Unit Name *</label>
                <Input name="unit_name" value={form.unit_name} onChange={handleChange} required
                  placeholder="e.g. 3rd Marine Expeditionary Unit"
                  className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Contact Name</label>
                  <Input name="contact_name" value={form.contact_name} onChange={handleChange}
                    placeholder="Unit POC name"
                    className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Contact Email *</label>
                  <Input name="contact_email" type="email" value={form.contact_email} onChange={handleChange} required
                    placeholder="unit@example.com"
                    className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Unit Timezone</label>
                  <Input name="unit_timezone" value={form.unit_timezone} onChange={handleChange}
                    placeholder="e.g. US/Eastern, UTC+2"
                    className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Approximate Member Count</label>
                  <Input name="member_count" type="number" min="1" value={form.member_count} onChange={handleChange}
                    className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Description of Unit</label>
                <Textarea name="description" value={form.description} onChange={handleChange}
                  placeholder="Brief overview of your unit, background, and operations"
                  rows={3} className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Primary Unit Tasking</label>
                <Input name="primary_tasking" value={form.primary_tasking} onChange={handleChange}
                  placeholder="e.g. Infantry, Mechanized, Aviation, Logistics"
                  className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Additional Information</label>
                <Textarea name="additional_info" value={form.additional_info} onChange={handleChange}
                  placeholder="Any other details relevant to partnership (experience, availability, etc.)"
                  rows={2} className="bg-black/50 border-gray-700 focus:border-tropic-olive" />
              </div>

              <Button type="submit" disabled={submitting}
                className="w-full bg-tropic-olive hover:bg-tropic-olive/80 text-white font-bold tracking-wider">
                <Shield className="w-4 h-4 mr-2" />
                {submitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center space-y-2">
          <Link to="/partner-login" className="text-sm text-tropic-olive hover:text-tropic-gold transition-colors block">
            Already have an invite? Partner Login →
          </Link>
          <Link to="/" className="text-sm text-gray-500 hover:text-tropic-gold transition-colors block">
            <ArrowLeft className="w-3 h-3 inline mr-1" />Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PartnerApply;
