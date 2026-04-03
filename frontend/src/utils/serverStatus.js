export function normalizeServer(server) {
  if (!server) return server;

  const next = { ...server };

  if (next.status === 'provisioning_partial') {
    next.status = 'running';
    next.deployment_state = next.deployment_state || 'created';
    next.provisioning_state = 'warning';
    next.readiness_state = next.readiness_state || 'ready';
  }

  if (next.status === 'provisioning_failed') {
    next.status = 'error';
    next.deployment_state = 'failed';
    next.provisioning_state = 'failed';
    next.readiness_state = 'failed';
  }

  if (!next.deployment_state) {
    next.deployment_state = next.status === 'error' ? 'failed' : 'created';
  }

  if (next.status === 'running' && next.provisioning_state === 'warning' && !next.readiness_state) {
    next.readiness_state = 'degraded';
  }

  return next;
}

export function isServerDegraded(server) {
  const normalized = normalizeServer(server);
  if (!normalized) return false;
  return normalized.readiness_state === 'degraded' || normalized.provisioning_state === 'warning';
}

export function getOperationalSummary(server) {
  const normalized = normalizeServer(server);
  if (!normalized) {
    return {
      state: 'unknown',
      label: 'UNKNOWN',
      detail: 'Status could not be determined.',
    };
  }

  if (normalized.status === 'running' && isServerDegraded(normalized)) {
    return {
      state: 'degraded',
      label: 'RUNNING WITH ATTENTION',
      detail: normalized.summary_message || 'Server deployment succeeded, but one or more follow-up stages need attention.',
    };
  }

  if (normalized.deployment_state === 'created' && ['queued', 'running'].includes(normalized.provisioning_state)) {
    return {
      state: 'created',
      label: 'DEPLOYED',
      detail: normalized.summary_message || 'Server deployment succeeded and first-boot provisioning is still running.',
    };
  }

  if (normalized.status === 'running') {
    return {
      state: 'running',
      label: 'OPERATIONAL',
      detail: 'Server is live and reporting a healthy runtime state.',
    };
  }

  if (normalized.status === 'error') {
    return {
      state: 'error',
      label: 'ERROR',
      detail: normalized.summary_message || normalized.last_docker_error || 'Creation or startup failed before the server became operational.',
    };
  }

  return {
    state: normalized.status,
    label: String(normalized.status || 'unknown').replace(/_/g, ' ').toUpperCase(),
    detail: normalized.summary_message || normalized.last_docker_error || 'Server state is updating.',
  };
}

export function canStartServer(server) {
  const normalized = normalizeServer(server);
  return ['created', 'stopped', 'error', 'crash_loop'].includes(normalized?.status);
}

export function canStopServer(server) {
  const normalized = normalizeServer(server);
  return ['running', 'starting', 'initializing'].includes(normalized?.status);
}

export function canRestartServer(server) {
  const normalized = normalizeServer(server);
  return normalized?.status === 'running';
}
