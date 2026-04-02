import React, { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Download,
  Eye,
  RefreshCw,
  Folder,
  File,
  ChevronRight,
} from 'lucide-react';

function FileManagerModule() {
  const { server, serverId } = useOutletContext();
  const [path, setPath] = useState('/');

  // File manager operates on server config files and generated assets
  const configFiles = [
    { name: 'server.json', type: 'file', size: '2.4 KB', modified: 'Generated from config' },
    { name: 'mods.json', type: 'file', size: '1.1 KB', modified: 'Generated from mod list' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          FILE MANAGER
        </h2>
        <Button size="sm" variant="outline" className="h-7 border-zinc-800 text-xs text-gray-400">
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh
        </Button>
      </div>

      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1 text-xs text-gray-500 font-mono">
            <Folder className="h-3.5 w-3.5 text-tropic-gold" />
            <span>/server-configs/{server?.container_name || serverId}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-zinc-800/50">
            {configFiles.map((file) => (
              <div key={file.name} className="flex items-center gap-3 py-2.5 hover:bg-zinc-900/30 rounded px-2 transition-colors">
                {file.type === 'folder' ? (
                  <Folder className="h-4 w-4 text-tropic-gold" />
                ) : (
                  <FileText className="h-4 w-4 text-gray-500" />
                )}
                <span className="flex-1 text-xs text-gray-200 font-mono">{file.name}</span>
                <span className="text-[10px] text-gray-600">{file.size}</span>
                <span className="text-[10px] text-gray-600">{file.modified}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-500 hover:text-tropic-gold">
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-500 hover:text-tropic-gold">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-gray-600">
        <p>File manager provides safe read/write access to generated server configuration files.</p>
        <p className="mt-1">Only server-managed assets within the safe scope are accessible.</p>
      </div>
    </div>
  );
}

export default FileManagerModule;
