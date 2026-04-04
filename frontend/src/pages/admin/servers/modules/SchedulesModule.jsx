import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { API } from '@/utils/api';
import {
  CalendarClock,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';

const EMPTY_FORM = {
  action_type: 'restart',
  schedule: '0 4 * * *',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  downtime_minutes: 60,
  enabled: true,
};

function SchedulesModule() {
  const { serverId } = useOutletContext();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/schedules`);
      setSchedules(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const createSchedule = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        downtime_minutes: form.action_type === 'downtime_window' ? Number(form.downtime_minutes || 0) : null,
      };
      await axios.post(`${API}/servers/${serverId}/schedules`, payload);
      setForm(EMPTY_FORM);
      await fetchSchedules();
    } finally {
      setSaving(false);
    }
  }, [fetchSchedules, form, serverId]);

  const updateSchedule = useCallback(async (schedule) => {
    await axios.put(`${API}/servers/${serverId}/schedules/${schedule.id}`, {
      action_type: schedule.action_type,
      schedule: schedule.schedule,
      timezone: schedule.timezone,
      enabled: schedule.enabled,
      downtime_minutes: schedule.action_type === 'downtime_window' ? Number(schedule.downtime_minutes || 0) : null,
    });
    await fetchSchedules();
  }, [fetchSchedules, serverId]);

  const deleteSchedule = useCallback(async (scheduleId) => {
    await axios.delete(`${API}/servers/${serverId}/schedules/${scheduleId}`);
    await fetchSchedules();
  }, [fetchSchedules, serverId]);

  const actionHelp = useMemo(() => ({
    restart: 'Restart the server when the schedule triggers.',
    start: 'Start the server when the schedule triggers.',
    stop: 'Stop the server when the schedule triggers.',
    downtime_window: 'Stop the server at the start time, then auto-start it again after the downtime duration.',
  }), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          SCHEDULES
        </h2>
        <Button size="sm" variant="outline" onClick={fetchSchedules} className="h-7 border-zinc-800 text-xs text-[#8a9aa8]">
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh
        </Button>
      </div>

      <Card className="border-zinc-800 bg-[#050a0e]/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
            <Plus className="h-3.5 w-3.5 text-tropic-gold" /> NEW SCHEDULE
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1 text-xs text-[#4a6070]">
            <span>Action</span>
            <select
              value={form.action_type}
              onChange={(e) => setForm((prev) => ({ ...prev, action_type: e.target.value }))}
              className="h-9 w-full rounded-md border border-zinc-800 bg-[#050a0e]/60 px-3 text-xs text-white"
            >
              <option value="restart">Restart</option>
              <option value="start">Start</option>
              <option value="stop">Stop</option>
              <option value="downtime_window">Downtime Window</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#4a6070]">
            <span>Cron Schedule</span>
            <Input
              value={form.schedule}
              onChange={(e) => setForm((prev) => ({ ...prev, schedule: e.target.value }))}
              placeholder="0 4 * * *"
              className="h-9 border-zinc-800 bg-[#050a0e]/60 text-xs text-white"
            />
          </label>

          <label className="space-y-1 text-xs text-[#4a6070]">
            <span>Timezone</span>
            <Input
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              className="h-9 border-zinc-800 bg-[#050a0e]/60 text-xs text-white"
            />
          </label>

          {form.action_type === 'downtime_window' && (
            <label className="space-y-1 text-xs text-[#4a6070]">
              <span>Downtime Minutes</span>
              <Input
                type="number"
                value={form.downtime_minutes}
                onChange={(e) => setForm((prev) => ({ ...prev, downtime_minutes: e.target.value }))}
                className="h-9 border-zinc-800 bg-[#050a0e]/60 text-xs text-white"
              />
            </label>
          )}

          <div className="lg:col-span-2 rounded border border-zinc-800/70 bg-[#050a0e]/40 px-3 py-2 text-xs text-[#4a6070]">
            {actionHelp[form.action_type]}
          </div>

          <div className="flex items-center gap-2 text-xs text-[#4a6070]">
            <Switch checked={form.enabled} onCheckedChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))} className="h-4 w-7" />
            Enabled
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={createSchedule} disabled={saving} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-[#050a0e]/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
            <CalendarClock className="h-3.5 w-3.5 text-tropic-gold" /> ACTIVE SCHEDULES
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
            </div>
          ) : schedules.length === 0 ? (
            <p className="text-xs text-[#4a6070]">No schedules have been created for this server yet.</p>
          ) : (
            schedules.map((schedule) => (
              <div key={schedule.id} className="rounded border border-zinc-800/70 bg-[#050a0e]/40 p-3">
                <div className="grid gap-3 lg:grid-cols-5">
                  <select
                    value={schedule.action_type}
                    onChange={(e) => setSchedules((prev) => prev.map((item) => item.id === schedule.id ? { ...item, action_type: e.target.value } : item))}
                    className="h-9 rounded-md border border-zinc-800 bg-[#050a0e]/60 px-3 text-xs text-white"
                  >
                    <option value="restart">Restart</option>
                    <option value="start">Start</option>
                    <option value="stop">Stop</option>
                    <option value="downtime_window">Downtime Window</option>
                  </select>
                  <Input
                    value={schedule.schedule || ''}
                    onChange={(e) => setSchedules((prev) => prev.map((item) => item.id === schedule.id ? { ...item, schedule: e.target.value } : item))}
                    className="h-9 border-zinc-800 bg-[#050a0e]/60 text-xs text-white"
                  />
                  <Input
                    value={schedule.timezone || ''}
                    onChange={(e) => setSchedules((prev) => prev.map((item) => item.id === schedule.id ? { ...item, timezone: e.target.value } : item))}
                    className="h-9 border-zinc-800 bg-[#050a0e]/60 text-xs text-white"
                  />
                  <Input
                    type="number"
                    value={schedule.downtime_minutes || ''}
                    disabled={schedule.action_type !== 'downtime_window'}
                    onChange={(e) => setSchedules((prev) => prev.map((item) => item.id === schedule.id ? { ...item, downtime_minutes: e.target.value } : item))}
                    className="h-9 border-zinc-800 bg-[#050a0e]/60 text-xs text-white"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Switch
                      checked={schedule.enabled !== false}
                      onCheckedChange={(value) => setSchedules((prev) => prev.map((item) => item.id === schedule.id ? { ...item, enabled: value } : item))}
                      className="h-4 w-7"
                    />
                    <Button size="sm" variant="outline" onClick={() => updateSchedule(schedule)} className="h-8 border-zinc-800 text-xs text-[#8a9aa8]">
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteSchedule(schedule.id)} className="h-8 text-red-400 hover:text-red-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#4a6070]">
                  <span>Next run: {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : '-'}</span>
                  <span>Last run: {schedule.last_run ? new Date(schedule.last_run).toLocaleString() : '-'}</span>
                  <span>Last result: {schedule.last_result?.message || '-'}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SchedulesModule;
