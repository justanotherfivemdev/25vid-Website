import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { API } from '@/utils/api';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Edit3,
  File,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** idx).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fileIcon(entry) {
  if (entry.is_dir) return <Folder className="h-4 w-4 text-tropic-gold" />;
  const ext = (entry.name || '').split('.').pop()?.toLowerCase();
  if (['json', 'xml', 'cfg', 'ini', 'yaml', 'yml', 'toml', 'conf', 'properties'].includes(ext)) {
    return <FileText className="h-4 w-4 text-blue-400" />;
  }
  if (['log', 'txt'].includes(ext)) {
    return <FileText className="h-4 w-4 text-zinc-400" />;
  }
  return <File className="h-4 w-4 text-zinc-500" />;
}

const ROOT_LABELS = { config: 'Configs', profile: 'Profile', workshop: 'Workshop' };
const ROOT_ICONS = {
  config: <HardDrive className="h-3.5 w-3.5" />,
  profile: <FolderOpen className="h-3.5 w-3.5" />,
  workshop: <Folder className="h-3.5 w-3.5" />,
};

function FileManagerModule() {
  const { serverId } = useOutletContext();

  // Root state
  const [roots, setRoots] = useState([]);
  const [rootsLoading, setRootsLoading] = useState(true);

  // Browsing state
  const [activeRoot, setActiveRoot] = useState('config');
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState(null);
  const [filter, setFilter] = useState('');

  // Editor state
  const [editFile, setEditFile] = useState(null); // { root, path, name, content, modified }
  const [editContent, setEditContent] = useState('');
  const [editDirty, setEditDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [readError, setReadError] = useState(null);
  const [reading, setReading] = useState(false);

  // Active tab: 'browser' or 'profile'
  const [activeTab, setActiveTab] = useState('browser');

  // Fetch available roots
  const fetchRoots = useCallback(async () => {
    setRootsLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/files/roots`);
      setRoots(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRoots([]);
    } finally {
      setRootsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchRoots();
  }, [fetchRoots]);

  // Browse a directory
  const browse = useCallback(async (root, path) => {
    setBrowsing(true);
    setBrowseError(null);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/files/browse`, {
        params: { root, path: path || '' },
      });
      setActiveRoot(root);
      setCurrentPath(path || '');
      setEntries(res.data?.entries || []);
    } catch (err) {
      setBrowseError(err.response?.data?.detail || 'Failed to browse directory');
      setEntries([]);
    } finally {
      setBrowsing(false);
    }
  }, [serverId]);

  // Initial browse when roots load
  useEffect(() => {
    if (roots.length > 0) {
      const initial = activeTab === 'profile'
        ? roots.find((r) => r.key === 'profile' && r.exists)
        : roots.find((r) => r.exists);
      if (initial) {
        browse(initial.key, '');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots]);

  // Navigate into a directory
  const navigateInto = useCallback((entry) => {
    if (entry.is_dir) {
      browse(activeRoot, entry.path);
    }
  }, [activeRoot, browse]);

  // Navigate up
  const navigateUp = useCallback(() => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    browse(activeRoot, parts.join('/'));
  }, [activeRoot, currentPath, browse]);

  // Open a file for editing
  const openFile = useCallback(async (entry) => {
    if (entry.is_dir) return;
    setReading(true);
    setReadError(null);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/files/read`, {
        params: { root: activeRoot, path: entry.path },
      });
      setEditFile({
        root: activeRoot,
        path: entry.path,
        name: res.data.name,
        modified: res.data.modified,
      });
      setEditContent(res.data.content || '');
      setEditDirty(false);
      setSaveError(null);
    } catch (err) {
      setReadError(err.response?.data?.detail || 'Failed to read file');
    } finally {
      setReading(false);
    }
  }, [activeRoot, serverId]);

  // Save file
  const saveFile = useCallback(async () => {
    if (!editFile) return;
    setSaving(true);
    setSaveError(null);
    try {
      await axios.put(
        `${API}/servers/${serverId}/files/write`,
        { content: editContent },
        { params: { root: editFile.root, path: editFile.path } },
      );
      setEditDirty(false);
      // Refresh the directory listing
      browse(activeRoot, currentPath);
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [editFile, editContent, serverId, activeRoot, currentPath, browse]);

  // Close editor
  const closeEditor = useCallback(() => {
    setEditFile(null);
    setEditContent('');
    setEditDirty(false);
    setSaveError(null);
    setReadError(null);
  }, []);

  // Breadcrumb segments
  const breadcrumbs = useMemo(() => {
    const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
    const crumbs = [{ label: ROOT_LABELS[activeRoot] || activeRoot, path: '' }];
    let running = '';
    parts.forEach((part) => {
      running = running ? `${running}/${part}` : part;
      crumbs.push({ label: part, path: running });
    });
    return crumbs;
  }, [activeRoot, currentPath]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return entries;
    const q = filter.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, filter]);

  // Switch to profile tab
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    closeEditor();
    if (tab === 'profile') {
      const profileRoot = roots.find((r) => r.key === 'profile' && r.exists);
      if (profileRoot) {
        browse('profile', '');
      }
    } else if (tab === 'browser' && activeRoot === 'profile') {
      const configRoot = roots.find((r) => r.key === 'config' && r.exists);
      if (configRoot) {
        browse('config', '');
      }
    }
  }, [activeRoot, browse, closeEditor, roots]);

  if (rootsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          FILE MANAGER
        </h2>
        <Button size="sm" variant="outline" onClick={() => browse(activeRoot, currentPath)} className="h-7 border-zinc-800 text-xs text-[#8a9aa8]">
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-[#050a0e]/60">
          <TabsTrigger value="browser" className="text-xs">
            <HardDrive className="mr-1 h-3 w-3" /> All Files
          </TabsTrigger>
          <TabsTrigger value="profile" className="text-xs">
            <FolderOpen className="mr-1 h-3 w-3" /> Deployed Profile
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browser" className="space-y-4">
          {/* Root selector */}
          <div className="flex flex-wrap gap-2">
            {roots.map((root) => (
              <button
                key={root.key}
                onClick={() => { closeEditor(); browse(root.key, ''); }}
                disabled={!root.exists}
                className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
                  activeRoot === root.key && activeTab === 'browser'
                    ? 'border-tropic-gold/30 bg-tropic-gold/10 text-tropic-gold'
                    : 'border-zinc-800 bg-[#050a0e]/40 text-[#8a9aa8] hover:border-zinc-700'
                } disabled:opacity-40`}
              >
                {ROOT_ICONS[root.key]}
                {root.label}
                {!root.exists && <span className="text-[10px] text-[#4a6070]">(not found)</span>}
              </button>
            ))}
          </div>

          {renderFileBrowser()}
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <div className="rounded border border-amber-600/20 bg-amber-600/5 px-3 py-2 text-xs text-amber-400">
            <FolderOpen className="mr-1.5 inline h-3.5 w-3.5" />
            Showing the profile directory where mods deploy their configuration files. Changes here take effect after a server restart.
          </div>

          {roots.find((r) => r.key === 'profile' && r.exists) ? (
            renderFileBrowser()
          ) : (
            <Card className="border-zinc-800 bg-[#050a0e]/60">
              <CardContent className="py-10 text-center text-sm text-[#4a6070]">
                The profile directory does not exist yet. It will be created when the server starts for the first time.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  function renderFileBrowser() {
    return (
      <>
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-xs">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.path}>
              {i > 0 && <ChevronRight className="h-3 w-3 text-[#4a6070]" />}
              <button
                onClick={() => browse(activeRoot, crumb.path)}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  i === breadcrumbs.length - 1
                    ? 'text-tropic-gold'
                    : 'text-[#8a9aa8] hover:text-tropic-gold'
                }`}
              >
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
          {browsing && <Loader2 className="ml-2 h-3 w-3 animate-spin text-tropic-gold" />}
        </div>

        {/* Filter + Back */}
        <div className="flex items-center gap-2">
          {currentPath && (
            <Button size="sm" variant="outline" onClick={navigateUp} className="h-8 border-zinc-800 text-xs text-[#8a9aa8]">
              <ArrowLeft className="mr-1 h-3 w-3" /> Up
            </Button>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4a6070]" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files..."
              className="h-8 border-zinc-800 bg-[#050a0e]/60 pl-9 text-xs text-white placeholder:text-[#4a6070]"
            />
          </div>
        </div>

        {browseError && (
          <div className="flex items-center gap-2 rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {browseError}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          {/* File listing */}
          <Card className="border-zinc-800 bg-[#050a0e]/80">
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredEntries.length === 0 && !browsing ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[#4a6070]">
                    <Folder className="mb-2 h-8 w-8" />
                    <p className="text-sm">{filter ? 'No matching files' : 'Directory is empty'}</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800/50 text-[10px] uppercase tracking-wider text-[#4a6070]">
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-right font-medium">Size</th>
                        <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Modified</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry) => (
                        <tr
                          key={entry.path}
                          className={`border-b border-zinc-800/30 transition-colors hover:bg-zinc-900/50 ${
                            editFile?.path === entry.path ? 'bg-tropic-gold/5' : ''
                          }`}
                        >
                          <td className="px-3 py-2">
                            <button
                              onClick={() => entry.is_dir ? navigateInto(entry) : openFile(entry)}
                              className="flex items-center gap-2 text-left text-xs text-[#8a9aa8] hover:text-white"
                            >
                              {fileIcon(entry)}
                              <span className={entry.is_dir ? 'font-medium text-tropic-gold' : ''}>
                                {entry.name}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[10px] text-[#4a6070]">
                            {entry.is_dir ? '' : formatBytes(entry.size)}
                          </td>
                          <td className="hidden px-3 py-2 text-right text-[10px] text-[#4a6070] sm:table-cell">
                            {entry.is_dir ? '' : formatDate(entry.modified)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!entry.is_dir && entry.editable && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openFile(entry)}
                                className="h-6 px-2 text-[10px] text-[#8a9aa8] hover:text-tropic-gold"
                              >
                                <Edit3 className="mr-1 h-3 w-3" /> Edit
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Editor panel */}
          <div className="space-y-4">
            {reading && (
              <Card className="border-zinc-800 bg-[#050a0e]/60">
                <CardContent className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
                </CardContent>
              </Card>
            )}

            {readError && !reading && (
              <Card className="border-zinc-800 bg-[#050a0e]/60">
                <CardContent className="py-6 text-center text-xs text-red-400">
                  <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
                  {readError}
                </CardContent>
              </Card>
            )}

            {editFile && !reading && (
              <Card className="border-zinc-800 bg-[#050a0e]/80">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
                      <FileText className="h-3.5 w-3.5 text-tropic-gold" />
                      {editFile.name}
                      {editDirty && (
                        <Badge variant="outline" className="border-amber-600/30 text-[10px] text-amber-400">
                          Unsaved
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        onClick={saveFile}
                        disabled={!editDirty || saving}
                        className="h-6 bg-tropic-gold px-2 text-[10px] text-black hover:bg-tropic-gold-light"
                      >
                        {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={closeEditor}
                        className="h-6 px-1.5 text-[#4a6070] hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#4a6070]">
                    {editFile.root}:/{editFile.path}
                  </div>
                </CardHeader>
                <CardContent>
                  {saveError && (
                    <div className="mb-2 rounded border border-red-600/30 bg-red-600/10 px-2 py-1 text-[10px] text-red-400">
                      {saveError}
                    </div>
                  )}
                  <Textarea
                    value={editContent}
                    onChange={(e) => { setEditContent(e.target.value); setEditDirty(true); }}
                    className="min-h-[40vh] border-zinc-800 bg-[#050a0e]/80 font-mono text-xs text-green-400 placeholder:text-[#4a6070]"
                    spellCheck={false}
                  />
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[#4a6070]">
                    <span>{editFile.modified ? `Modified: ${formatDate(editFile.modified)}` : ''}</span>
                    <span>{editContent.length.toLocaleString()} chars</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {!editFile && !reading && !readError && (
              <Card className="border-zinc-800 bg-[#050a0e]/60">
                <CardContent className="py-10 text-center text-xs text-[#4a6070]">
                  <FileText className="mx-auto mb-2 h-8 w-8 text-[#4a6070]" />
                  <p>Select a file to view or edit.</p>
                  <p className="mt-1 text-[10px]">Editable files: .json, .cfg, .ini, .xml, .yaml, .txt, .conf, and more.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </>
    );
  }
}

export default FileManagerModule;
