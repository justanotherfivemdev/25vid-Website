import React from 'react';
import { Input } from '@/components/ui/input';

const ThreatFilters = ({ filters, onChange }) => {
  return (
    <div className="grid md:grid-cols-3 gap-2">
      <Input
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="bg-black border-gray-700"
        placeholder="Search region/objective"
      />
      <select
        value={filters.severity}
        onChange={(e) => onChange({ ...filters, severity: e.target.value })}
        className="h-10 rounded-md bg-black border border-gray-700 px-3 text-sm"
      >
        <option value="all">All Severities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>
      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="h-10 rounded-md bg-black border border-gray-700 px-3 text-sm"
      >
        <option value="all">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="complete">Complete</option>
        <option value="failed">Failed</option>
        <option value="planned">Planned</option>
        <option value="ongoing">Ongoing</option>
        <option value="completed">Completed</option>
        <option value="routine">Routine</option>
        <option value="priority">Priority</option>
        <option value="immediate">Immediate</option>
        <option value="flash">Flash</option>
      </select>
    </div>
  );
};

export default ThreatFilters;
