import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Shield, Home, LogOut, Users, ChevronRight, ChevronDown, Building2, LayoutGrid, FileSpreadsheet } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';

import { BACKEND_URL, API } from '@/utils/api';
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const STATUS_COLORS = {
  recruit: 'bg-tropic-gold-dark',
  active: 'bg-tropic-red',
  reserve: 'bg-gray-700',
  staff: 'bg-tropic-gold-dark',
  command: 'bg-tropic-red',
  inactive: 'bg-gray-700'
};

const MemberCard = ({ member, compact = false }) => (
  <Link to={`/roster/${member.id}`}>
    <Card className={`bg-gray-900/80 border-gray-800 hover:border-tropic-red/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-tropic-red/10 group ${compact ? '' : ''}`} data-testid={`roster-card-${member.id}`}>
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-start gap-3">
          {member.avatar_url ? (
            <img src={resolveImg(member.avatar_url)} alt="" className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-lg object-cover border border-gray-700`} />
          ) : (
            <div className={`${compact ? 'w-10 h-10 text-base' : 'w-12 h-12 text-lg'} rounded-lg bg-gray-800 flex items-center justify-center font-bold text-gray-500 border border-gray-700`} style={{ fontFamily: 'Rajdhani, sans-serif' }}>{member.username[0]?.toUpperCase()}</div>
          )}
          <div className="flex-1 min-w-0">
            <div className={`font-bold ${compact ? 'text-sm' : 'text-base'} tracking-wide truncate group-hover:text-tropic-gold transition-colors`} style={{ fontFamily: 'Rajdhani, sans-serif' }}>{member.username}</div>
            {member.rank && <div className="text-xs text-gray-400">{member.rank}</div>}
            {member.billet && <div className="text-xs text-tropic-gold/80">{member.billet}</div>}
            {!compact && member.specialization && <div className="text-xs text-gray-500">{member.specialization}</div>}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-tropic-red transition-colors shrink-0 mt-1" />
        </div>
        {!compact && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge className={`${STATUS_COLORS[member.status] || 'bg-gray-700'} text-white text-[10px] px-2 py-0`}>{(member.status || 'recruit').toUpperCase()}</Badge>
            {member.company && <span className="text-[10px] text-tropic-gold border border-tropic-gold/50 px-1.5 py-0 rounded">{member.company}</span>}
            {member.platoon && <span className="text-[10px] text-green-400 border border-green-800/50 px-1.5 py-0 rounded">{member.platoon}</span>}
            {member.squad && <span className="text-[10px] text-gray-500 border border-gray-800 px-1.5 py-0 rounded">{member.squad}</span>}
            {member.role === 'admin' && <Badge className="bg-tropic-red/50 text-tropic-gold text-[10px] px-2 py-0">ADMIN</Badge>}
          </div>
        )}
      </CardContent>
    </Card>
  </Link>
);

const HierarchySection = ({ title, members, icon: Icon, color, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!members?.length) return null;
  
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button 
        onClick={() => setOpen(!open)} 
        className={`w-full flex items-center justify-between px-4 py-3 bg-gray-900/80 hover:bg-gray-900 transition-colors`}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`w-5 h-5 ${color}`} />}
          <span className="font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{title}</span>
          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400">{members.length}</Badge>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map(m => <MemberCard key={m.id} member={m} compact />)}
        </div>
      )}
    </div>
  );
};

const UnitRoster = () => {
  const [members, setMembers] = useState([]);
  const [hierarchy, setHierarchy] = useState(null);
  const [hierarchyError, setHierarchyError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('hierarchy'); // 'hierarchy' or 'grid'
  const [search, setSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rosterRes, hierarchyRes] = await Promise.all([
        axios.get(`${API}/roster`),
        axios.get(`${API}/roster/hierarchy`).catch(err => {
          console.error('Hierarchy endpoint failed:', err.response?.status || err.message);
          setHierarchyError(true);
          return { data: null };
        })
      ]);
      setMembers(rosterRes.data);
      if (hierarchyRes.data) {
        setHierarchy(hierarchyRes.data);
        setHierarchyError(false);
      }
    } catch (e) { console.error('Roster fetch failed:', e); }
    finally { setLoading(false); }
  };

  const ranks = [...new Set(members.map(m => m.rank).filter(Boolean))].sort();
  const companies = [...new Set(members.map(m => m.company).filter(Boolean))].sort();
  const statuses = [...new Set(members.map(m => m.status).filter(Boolean))].sort();

  const filtered = members.filter(m => {
    if (search && !m.username.toLowerCase().includes(search.toLowerCase())) return false;
    if (rankFilter !== 'all' && m.rank !== rankFilter) return false;
    if (companyFilter !== 'all' && m.company !== companyFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    return true;
  });

  const handleLogout = async () => { await logout(); navigate('/'); };

  const toCsvValue = (value) => {
    if (value === null || value === undefined) return '""';
    const raw = String(value);
    const trimmed = raw.trimStart();
    const formulaSafe = /^[=+\-@]/.test(trimmed) ? `'${raw}` : raw;
    const escaped = formulaSafe.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const handleGoogleSheetsExport = async () => {
    if (!members.length) return;

    const headers = [
      'Username',
      'Rank',
      'Billet',
      'Specialization',
      'Status',
      'Company',
      'Platoon',
      'Squad',
      'Role'
    ];

    const sortedMembers = [...members].sort((a, b) => a.username.localeCompare(b.username));
    const rows = sortedMembers.map((member) => [
      member.username,
      member.rank,
      member.billet,
      member.specialization,
      member.status,
      member.company,
      member.platoon,
      member.squad,
      member.role
    ]);

    const csvText = [headers, ...rows]
      .map((row) => row.map(toCsvValue).join(','))
      .join('\n');

    const dateSuffix = new Date().toISOString().slice(0, 10);
    const fileName = `roster-export-${dateSuffix}.csv`;
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(csvText).catch(() => null);
    }

    window.open('https://docs.google.com/spreadsheets/create', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-red/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700">Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>UNIT ROSTER</h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin"><Button size="sm" variant="outline" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"><Shield className="w-4 h-4" /></Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-7xl space-y-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-tropic-gold" />
              <div>
                <h2 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="roster-title">PERSONNEL DIRECTORY</h2>
                <p className="text-sm text-gray-500">{filtered.length} of {members.length} operators</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {user?.role === 'admin' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-600/60 text-green-400 hover:bg-green-900/20"
                  onClick={handleGoogleSheetsExport}
                  data-testid="export-google-sheets"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />Export to Google Sheets
                </Button>
              )}

              {/* View Toggle - 25th ID colors */}
              <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
                <Button 
                  size="sm" 
                  variant={viewMode === 'hierarchy' ? 'default' : 'ghost'}
                  className={viewMode === 'hierarchy' ? 'bg-tropic-red hover:bg-tropic-red-dark' : 'text-gray-400 hover:text-white'}
                  onClick={() => setViewMode('hierarchy')}
                  data-testid="view-hierarchy"
                >
                  <Building2 className="w-4 h-4 mr-1" />Hierarchy
                </Button>
                <Button 
                  size="sm" 
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  className={viewMode === 'grid' ? 'bg-tropic-red hover:bg-tropic-red-dark' : 'text-gray-400 hover:text-white'}
                  onClick={() => setViewMode('grid')}
                  data-testid="view-grid"
                >
                  <LayoutGrid className="w-4 h-4 mr-1" />Grid
                </Button>
              </div>
            </div>
          </div>
          {user?.role === 'admin' && (
            <p className="text-xs text-gray-500 -mt-3">
              Export creates a CSV download and opens a new Google Sheet so you can import into any spreadsheet destination.
            </p>
          )}

          {/* Filters - only show in grid mode */}
          {viewMode === 'grid' && (
            <div className="flex flex-wrap gap-3 bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..." className="bg-black border-gray-700 pl-10" data-testid="roster-search" />
                </div>
              </div>
              {ranks.length > 0 && (
                <Select value={rankFilter} onValueChange={setRankFilter}>
                  <SelectTrigger className="bg-black border-gray-700 w-[150px]" data-testid="roster-filter-rank"><SelectValue placeholder="Rank" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="all">All Ranks</SelectItem>{ranks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="bg-black border-gray-700 w-[150px]"><SelectValue placeholder="Company" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="all">All Companies</SelectItem>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {statuses.length > 0 && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-black border-gray-700 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="all">All Status</SelectItem>{statuses.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading roster...</div>
          ) : viewMode === 'hierarchy' && hierarchy ? (
            <div className="space-y-4" data-testid="hierarchy-view">
              {/* Command Staff */}
              <HierarchySection 
                title="COMMAND STAFF" 
                members={hierarchy.command_staff} 
                icon={Shield} 
                color="text-tropic-gold"
              />
              
              {/* Companies */}
              {Object.entries(hierarchy.companies || {}).sort().map(([companyName, companyData]) => (
                <div key={companyName} className="space-y-3">
                  <div className="flex items-center gap-2 px-2">
                    <Building2 className="w-5 h-5 text-tropic-red" />
                    <h3 className="text-xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{companyName} COMPANY</h3>
                  </div>
                  
                  {/* Company HQ / Unassigned to platoon */}
                  {companyData.unassigned?.length > 0 && (
                    <HierarchySection 
                      title={`${companyName} Co. HQ`} 
                      members={companyData.unassigned} 
                      color="text-tropic-gold"
                      defaultOpen={false}
                    />
                  )}
                  
                  {/* Platoons */}
                  {Object.entries(companyData.platoons || {}).sort().map(([platoonName, platoonData]) => (
                    <div key={platoonName} className="ml-4 space-y-2">
                      {/* Platoon HQ / Unassigned to squad */}
                      {platoonData.unassigned?.length > 0 && (
                        <HierarchySection 
                          title={`${platoonName} HQ`} 
                          members={platoonData.unassigned} 
                          color="text-green-400"
                          defaultOpen={false}
                        />
                      )}
                      
                      {/* Squads */}
                      {Object.entries(platoonData.squads || {}).sort().map(([squadName, squadMembers]) => (
                        <div key={squadName} className="ml-4">
                          <HierarchySection 
                            title={squadName} 
                            members={squadMembers} 
                            color="text-gray-400"
                            defaultOpen={false}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              
              {/* Unassigned */}
              {hierarchy.unassigned?.length > 0 && (
                <HierarchySection 
                  title="UNASSIGNED PERSONNEL" 
                  members={hierarchy.unassigned} 
                  icon={Users} 
                  color="text-gray-500"
                  defaultOpen={false}
                />
              )}
            </div>
          ) : viewMode === 'hierarchy' && hierarchyError ? (
            <div className="text-center py-12 border border-dashed border-tropic-red/50 rounded-lg bg-tropic-red/10">
              <p className="text-tropic-gold mb-2">Could not load organizational hierarchy.</p>
              <Button size="sm" variant="outline" className="border-gray-700" onClick={() => setViewMode('grid')}>
                <LayoutGrid className="w-4 h-4 mr-1" />Switch to Grid View
              </Button>
            </div>
          ) : viewMode === 'hierarchy' && !hierarchy ? (
            <div className="text-center py-12 text-gray-500">Loading hierarchy...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-600 border border-dashed border-gray-800 rounded-lg">No operators match your filters.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="grid-view">
              {filtered.map(m => <MemberCard key={m.id} member={m} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnitRoster;
