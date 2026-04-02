import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * ServerCreate page has been replaced by the inline create-server modal
 * on the Dashboard.  This component only exists as a redirect in case
 * users still navigate to /admin/servers/create directly.
 */
function ServerCreate() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/admin/servers', { replace: true });
  }, [navigate]);
  return null;
}

export default ServerCreate;
