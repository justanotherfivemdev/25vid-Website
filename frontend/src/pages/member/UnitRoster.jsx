import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Shield, Home, LogOut, Users, ChevronRight, ChevronDown, Building2, LayoutGrid, FileSpreadsheet, Upload, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { isStaff } from '@/utils/permissions';

import { BACKEND_URL, API } from '@/utils/api';
import { useMemberLayout } from '@/components/MemberLayout';
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const STATUS_COLORS = {
  recruit: 'bg-tropic-gold-dark',
  active: 'bg-tropic-red',
  reserve: 'bg-[#111a24]',
  staff: 'bg-tropic-gold-dark',
  command: 'bg-tropic-red',
  inactive: 'bg-[#111a24]'
};

const PERSONNEL_LOG_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1pwfgKVRvGjA0ycWodum47Bj41Jj25U7XvlkaZ8VycfA/edit?usp=sharing';

const MemberCard = ({ member, compact = false }) => (
  <Link to={`/roster/${member.id}`}>
    <Card className={`bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)] hover:border-tropic-red/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-tropic-red/10 group ${compact ? '' : ''}`} data-testid={`roster-card-${member.id}`}>
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-start gap-3">
          {member.avatar_url ? (
            <img src={resolveImg(member.avatar_url)} alt="" className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-lg object-cover border border-[rgba(201,162,39,0.15)]`} />
          ) : (
            <div className={`${compact ? 'w-10 h-10 text-base' : 'w-12 h-12 text-lg'} rounded-lg bg-[#111a24] flex items-center justify-center font-bold text-[#4a6070] border border-[rgba(201,162,39,0.15)]`} style={{ fontFamily: "'Share Tech', sans-serif" }}>{member.username[0]?.toUpperCase()}</div>
          )}
          <div className="flex-1 min-w-0">
            <div className={`font-bold ${compact ? 'text-sm' : 'text-base'} tracking-wide truncate group-hover:text-tropic-gold transition-colors`} style={{ fontFamily: "'Share Tech', sans-serif" }}>{member.username}</div>
            {member.rank && <div className="text-xs text-[#8a9aa8]">{member.rank}</div>}
            {member.billet && <div className="text-xs text-tropic-gold/80">{member.billet_acronym ? `${member.billet_acronym} — ` : ''}{member.billet}</div>}
            {!compact && member.specialization && <div className="text-xs text-[#4a6070]">{member.specialization}</div>}
            {!compact && member.display_mos && <div className="text-xs text-[#4a6070] font-mono">{member.display_mos}</div>}
          </div>
          <ChevronRight className="w-4 h-4 text-[#4a6070] group-hover:text-tropic-red transition-colors shrink-0 mt-1" />
        </div>
        {!compact && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge className={`${STATUS_COLORS[member.status] || 'bg-[#111a24]'} text-white text-[10px] px-2 py-0`}>{(member.status || 'recruit').toUpperCase()}</Badge>
            {member.loa_status === 'on_loa' && <Badge className="bg-yellow-600/30 text-yellow-400 border border-yellow-600/40 text-[10px] px-2 py-0">LOA</Badge>}
            {member.company && <span className="text-[10px] text-tropic-gold border border-tropic-gold/50 px-1.5 py-0 rounded">{member.company}</span>}
            {member.platoon && <span className="text-[10px] text-green-400 border border-green-800/50 px-1.5 py-0 rounded">{member.platoon}</span>}
            {member.squad && <span className="text-[10px] text-[#4a6070] border border-[rgba(201,162,39,0.12)] px-1.5 py-0 rounded">{member.squad}</span>}
            {isStaff(member.role) && <Badge className="bg-tropic-red/50 text-tropic-gold text-[10px] px-2 py-0">STAFF</Badge>}
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
    <div className="border border-[rgba(201,162,39,0.12)] rounded-lg overflow-hidden">
      <button 
        onClick={() => setOpen(!open)} 
        className={`w-full flex items-center justify-between px-4 py-3 bg-[#0c1117]/80 hover:bg-[#0c1117] transition-colors`}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`w-5 h-5 ${color}`} />}
          <span className="font-bold tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>{title}</span>
          <Badge variant="outline" className="text-[10px] border-[rgba(201,162,39,0.15)] text-[#8a9aa8]">{members.length}</Badge>
        </div>
        <ChevronDown className={`w-5 h-5 text-[#4a6070] transition-transform ${open ? 'rotate-180' : ''}`} />
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
  const inLayout = useMemberLayout();
  const [members, setMembers] = useState([]);
  const [hierarchy, setHierarchy] = useState(null);
  const [hierarchyError, setHierarchyError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('hierarchy'); // 'hierarchy' or 'grid'
  const [rosterTab, setRosterTab] = useState('25th'); // '25th' or 'partners'
  const [partnerUnits, setPartnerUnits] = useState([]);
  const [expandedPartner, setExpandedPartner] = useState(null);
  const [partnerMembers, setPartnerMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
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

  const fetchPartnerUnits = async () => {
    try {
      const res = await axios.get(`${API}/roster/partner-units`);
      setPartnerUnits(res.data);
    } catch (err) {
      console.error('Failed to fetch partner units:', err);
    }
  };

  const expandPartnerUnit = async (unitId) => {
    if (expandedPartner === unitId) {
      setExpandedPartner(null);
      return;
    }
    try {
      const res = await axios.get(`${API}/roster/partner-units/${unitId}/members`);
      setPartnerMembers(res.data.members || []);
      setExpandedPartner(unitId);
    } catch (err) {
      console.error('Failed to fetch partner unit members:', err);
    }
  };

  const handleGoogleSheetsImport = async () => {
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const payload = { spreadsheetUrl: PERSONNEL_LOG_SHEET_URL };
      const res = await axios.post(`${API}/admin/import-users`, payload);
      setImportResult(res.data);
      await fetchData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setImportError(typeof detail === 'string' ? detail : (detail?.message || err.message || 'Import failed'));
    } finally {
      setImporting(false);
    }
  };

  const handleOpenImportDialog = () => {
    setImportResult(null);
    setImportError('');
    handleGoogleSheetsImport();
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
      'Billet Acronym',
      'MOS',
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
      member.billet_acronym,
      member.display_mos,
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
    <div className={inLayout ? '' : 'min-h-screen bg-[#050a0e] text-white'}>
      {!inLayout && (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050a0e]/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]">Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest text-tropic-gold" style={{ fontFamily: "'Share Tech', sans-serif" }}>UNIT ROSTER</h1>
          </div>
          <div className="flex items-center space-x-3">
            {isStaff(user?.role) && <Link to="/admin"><Button size="sm" variant="outline" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"><Shield className="w-4 h-4" /></Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-[rgba(201,162,39,0.15)]"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>
      )}

      <div className={`${inLayout ? 'pt-4' : 'pt-20'} pb-12 px-4 md:px-6`}>
        <div className="container mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-tropic-gold" />
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="roster-title">PERSONNEL DIRECTORY</h2>
                <p className="text-sm text-[#4a6070]">{rosterTab === '25th' ? `${filtered.length} of ${members.length} operators` : `${partnerUnits.length} partner units`}</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {isStaff(user?.role) && (
                <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-600/60 text-blue-400 hover:bg-blue-900/20"
                  onClick={handleOpenImportDialog}
                  data-testid="import-google-sheets"
                >
                  {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}Sync Personnel Log
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-600/60 text-green-400 hover:bg-green-900/20"
                  onClick={handleGoogleSheetsExport}
                  data-testid="export-google-sheets"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />Export to Google Sheets
                </Button>
                </>
              )}

              {/* View Toggle - 25th ID colors */}
              <div className="flex gap-1 bg-[#0c1117] border border-[rgba(201,162,39,0.12)] rounded-lg p-1">
                <Button 
                  size="sm" 
                  variant={viewMode === 'hierarchy' ? 'default' : 'ghost'}
                  className={viewMode === 'hierarchy' ? 'bg-tropic-red hover:bg-tropic-red-dark' : 'text-[#8a9aa8] hover:text-white'}
                  onClick={() => setViewMode('hierarchy')}
                  data-testid="view-hierarchy"
                >
                  <Building2 className="w-4 h-4 mr-1" />Hierarchy
                </Button>
                <Button 
                  size="sm" 
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  className={viewMode === 'grid' ? 'bg-tropic-red hover:bg-tropic-red-dark' : 'text-[#8a9aa8] hover:text-white'}
                  onClick={() => setViewMode('grid')}
                  data-testid="view-grid"
                >
                  <LayoutGrid className="w-4 h-4 mr-1" />Grid
                </Button>
              </div>
            </div>
          </div>
          {isStaff(user?.role) && (
            <div className="text-xs text-[#4a6070] -mt-3 space-y-1">
              <p>
                Sync Personnel Log pulls directly from the shared 25VID personnel sheet and reads the Personnel, In-Game Name, Rank, Role, and Extra Duties columns for pre-sign-up data.
              </p>
              <p>
                Export creates a CSV download and opens a new Google Sheet so you can import into any spreadsheet destination.
              </p>
            </div>
          )}

          {/* Roster Tab: 25th Members vs Partner Units */}
          <div className="flex gap-1 bg-[#0c1117] border border-[rgba(201,162,39,0.12)] rounded-lg p-1 w-fit">
            <Button
              size="sm"
              variant={rosterTab === '25th' ? 'default' : 'ghost'}
              className={rosterTab === '25th' ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light' : 'text-[#8a9aa8] hover:text-white'}
              onClick={() => setRosterTab('25th')}
              data-testid="roster-tab-25th"
            >
              <Users className="w-4 h-4 mr-1" />25th Members
            </Button>
            <Button
              size="sm"
              variant={rosterTab === 'partners' ? 'default' : 'ghost'}
              className={rosterTab === 'partners' ? 'bg-tropic-olive text-white hover:bg-tropic-olive/80' : 'text-[#8a9aa8] hover:text-white'}
              onClick={() => { setRosterTab('partners'); fetchPartnerUnits(); }}
              data-testid="roster-tab-partners"
            >
              <Shield className="w-4 h-4 mr-1" />Partner Units
            </Button>
          </div>

          {/* Filters - only show in grid mode for 25th tab */}
          {rosterTab === '25th' && viewMode === 'grid' && (
            <div className="flex flex-wrap gap-3 bg-[#0c1117]/50 border border-[rgba(201,162,39,0.12)] rounded-lg p-4">
              <div className="flex-1 min-w-0 sm:min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a6070]" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..." className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] pl-10" data-testid="roster-search" />
                </div>
              </div>
              {ranks.length > 0 && (
                <Select value={rankFilter} onValueChange={setRankFilter}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] w-full sm:w-[150px]" data-testid="roster-filter-rank"><SelectValue placeholder="Rank" /></SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]"><SelectItem value="all">All Ranks</SelectItem>{ranks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] w-full sm:w-[150px]"><SelectValue placeholder="Company" /></SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]"><SelectItem value="all">All Companies</SelectItem>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {statuses.length > 0 && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] w-full sm:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]"><SelectItem value="all">All Status</SelectItem>{statuses.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* 25th Members Content */}
          {rosterTab === '25th' && (
            <>
          {loading ? (
            <div className="text-center py-12 text-[#4a6070]">Loading roster...</div>
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
                    <h3 className="text-xl font-bold tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>{companyName} COMPANY</h3>
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
                            color="text-[#8a9aa8]"
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
                  color="text-[#4a6070]"
                  defaultOpen={false}
                />
              )}
            </div>
          ) : viewMode === 'hierarchy' && hierarchyError ? (
            <div className="text-center py-12 border border-dashed border-tropic-red/50 rounded-lg bg-tropic-red/10">
              <p className="text-tropic-gold mb-2">Could not load organizational hierarchy.</p>
              <Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]" onClick={() => setViewMode('grid')}>
                <LayoutGrid className="w-4 h-4 mr-1" />Switch to Grid View
              </Button>
            </div>
          ) : viewMode === 'hierarchy' && !hierarchy ? (
            <div className="text-center py-12 text-[#4a6070]">Loading hierarchy...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-[#4a6070] border border-dashed border-[rgba(201,162,39,0.12)] rounded-lg">No operators match your filters.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="grid-view">
              {filtered.map(m => <MemberCard key={m.id} member={m} />)}
            </div>
          )}
            </>
          )}

          {/* Partner Units Content */}
          {rosterTab === 'partners' && (
            <div className="space-y-3" data-testid="partner-units-view">
              {partnerUnits.length === 0 ? (
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-12 text-center text-[#4a6070]">
                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No enrolled partner units</p>
                  </CardContent>
                </Card>
              ) : (
                partnerUnits.map(pu => (
                  <div key={pu.id}>
                    <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)] hover:border-tropic-olive/40 transition-colors cursor-pointer"
                      onClick={() => expandPartnerUnit(pu.id)}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedPartner === pu.id ? <ChevronDown className="w-4 h-4 text-tropic-olive" /> : <ChevronRight className="w-4 h-4 text-[#4a6070]" />}
                          <div className="w-10 h-10 rounded-lg bg-tropic-olive/20 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-tropic-olive" />
                          </div>
                          <div>
                            <div className="font-bold text-sm">{pu.name}</div>
                            {pu.abbreviation && <span className="text-xs text-[#4a6070]">{pu.abbreviation}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-tropic-olive/20 text-tropic-olive border-tropic-olive/30 text-[10px]">
                            PARTNER UNIT
                          </Badge>
                          <span className="text-xs text-[#4a6070]"><Users className="w-3 h-3 inline mr-1" />{pu.member_count || 0}</span>
                        </div>
                      </CardContent>
                    </Card>
                    {expandedPartner === pu.id && (
                      <div className="ml-6 mt-1 space-y-1">
                        {partnerMembers.length === 0 ? (
                          <Card className="bg-[#111a24]/50 border-[rgba(201,162,39,0.15)]">
                            <CardContent className="p-4 text-center text-[#4a6070] text-sm">No members in this unit</CardContent>
                          </Card>
                        ) : (
                          partnerMembers.map(pm => (
                            <Card key={pm.id} className="bg-[#111a24]/50 border-[rgba(201,162,39,0.15)]">
                              <CardContent className="p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded bg-[#111a24] flex items-center justify-center text-sm font-bold text-tropic-olive">
                                    {pm.username?.[0]?.toUpperCase() || '?'}
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium">{pm.username}</span>
                                    {pm.rank && <span className="text-xs text-[#4a6070] ml-2">{pm.rank}</span>}
                                    {pm.billet && <span className="text-xs text-tropic-olive ml-2">{pm.billet}</span>}
                                  </div>
                                </div>
                                <Badge className={`text-[10px] ${pm.partner_role === 'partner_admin' ? 'bg-tropic-gold/20 text-tropic-gold' : 'bg-[#111a24]'}`}>
                                  {pm.partner_role === 'partner_admin' ? 'ADMIN' : 'MEMBER'}
                                </Badge>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {(importing || importError || importResult) && (
        <div className="fixed bottom-4 right-4 z-50 w-full max-w-xl px-4 sm:px-0">
          <Card className="bg-[#050a0e]/95 border-[rgba(201,162,39,0.12)] shadow-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg tracking-wider text-tropic-gold" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                PERSONNEL LOG SYNC
              </CardTitle>
              <p className="text-xs text-[#8a9aa8] break-all">{PERSONNEL_LOG_SHEET_URL}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {importing && (
                <div className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
                  <Loader2 className="inline w-4 h-4 mr-2 animate-spin" />
                  Syncing pre-sign-up data from the shared sheet...
                </div>
              )}

              {importError && (
                <div className="bg-tropic-red/10 border border-tropic-red/20 rounded p-3 text-sm text-tropic-red-light" data-testid="import-error">
                  {importError}
                </div>
              )}

              {importResult && (
                <div className="bg-green-900/20 border border-green-800/30 rounded p-3 space-y-2" data-testid="import-result">
                  <div className="text-sm font-medium text-green-400">Sync Complete</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#8a9aa8]">
                    <div>Imported: <span className="text-green-400 font-bold">{importResult.imported}</span></div>
                    <div>Updated: <span className="text-blue-400 font-bold">{importResult.updated}</span></div>
                    <div>Skipped: <span className="text-yellow-400 font-bold">{importResult.skipped}</span></div>
                    <div>Errors: <span className="text-red-400 font-bold">{importResult.errors}</span></div>
                  </div>
                  {importResult.sheet_name && (
                    <div className="text-[10px] text-[#4a6070]">Sheet: {importResult.sheet_name}</div>
                  )}
                  {importResult.field_mapping && Object.keys(importResult.field_mapping).length > 0 && (
                    <div className="text-[10px] text-[#4a6070]">
                      Mapped: {Object.entries(importResult.field_mapping).map(([field, col]) => `${field}→${col}`).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default UnitRoster;
