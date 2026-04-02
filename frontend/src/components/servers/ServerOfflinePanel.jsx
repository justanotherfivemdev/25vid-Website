import React from 'react';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function ServerOfflinePanel({
  title = 'Server is offline',
  description = 'Player metrics, RCON, stats, and other live server features are unavailable until the server is started.',
  onStart,
  starting = false,
}) {
  return (
    <Card className="border-amber-600/30 bg-amber-600/10">
      <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {title}
          </div>
          <p className="text-xs text-gray-300">{description}</p>
        </div>
        {onStart && (
          <Button
            size="sm"
            onClick={onStart}
            disabled={starting}
            className="bg-green-600 text-white hover:bg-green-500"
          >
            {starting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            Start Server
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default ServerOfflinePanel;
