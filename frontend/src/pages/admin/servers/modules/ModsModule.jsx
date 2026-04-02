import React from 'react';
import { useOutletContext } from 'react-router-dom';
import WorkshopBrowser from '@/pages/admin/servers/WorkshopBrowser';

function ModsModule() {
  const { serverId } = useOutletContext();

  return <WorkshopBrowser initialServerId={serverId} lockServerSelection embedded />;
}

export default ModsModule;
