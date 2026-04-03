# Reforger Live Validation

This validation must be run on the Linux host that has local access to the Docker daemon used by the FastAPI backend.

## What it validates

- Local Docker API access from the backend host
- Pull and create against `ghcr.io/acemod/arma-reforger:latest`
- First-boot profile generation inside the managed per-server data root
- Discovery of `ServerAdminTools_Config.json` inside the generated profile
- Optional deployment of a provided SAT baseline file into that generated profile
- BattlEye RCON reachability on the provisioned host port
- Cleanup of the temporary validation container and data root unless artifacts are explicitly kept

## Prerequisites

- Run this on the Linux Docker host, not a Windows workstation
- The backend Python dependencies from `backend/requirements.txt` must be installed
- The executing user must have local Docker access
- If you want to validate SAT baseline deployment, have a canonical `ServerAdminTools_Config.json` file available on the host

## Command

From the repository root:

```bash
python backend/scripts/validate_reforger_runtime.py \
  --profile-timeout 180 \
  --rcon-wait-seconds 60 \
  --output-json ./reforger-validation-report.json
```

To validate deployment of a provided SAT config baseline:

```bash
python backend/scripts/validate_reforger_runtime.py \
  --sat-baseline /opt/reforger/ServerAdminTools_Config.json \
  --output-json ./reforger-validation-report.json
```

If you want to inspect the generated container and files after the run, keep the artifacts:

```bash
python backend/scripts/validate_reforger_runtime.py \
  --keep-artifacts \
  --output-json ./reforger-validation-report.json
```

## Success Criteria

The report should show all required checks as passed:

- `docker_daemon`
- `image_available`
- `container_running`
- `profile_generated`
- `sat_config_present`
- `rcon_probe`

If `--sat-baseline` is supplied, `sat_baseline_applied` must also pass.

## Failure Interpretation

- `docker_daemon` failed: the backend host cannot reach the local Docker API
- `image_available` failed: the production image could not be pulled or resolved
- `profile_generated` failed: first boot did not create the expected profile structure
- `sat_config_present` failed: SAT did not materialize in the generated profile before timeout
- `sat_baseline_applied` failed: the provided SAT config was not copied into the discovered profile location
- `rcon_probe` failed: BattlEye RCON did not become reachable with the generated runtime password

## Notes

- The validator uses an isolated temporary server ID, container name, data root, and UDP ports.
- By default it cleans up after itself.
- The report includes a container log tail to help explain provisioning failures.
