# BIRD Docker Images

Minimal, rootless Docker images for **BIRD2** and **BIRD3**, used in CI pipelines and local debugging.

| Image          | Base                     | Package | BIRD Version |
| -------------- | ------------------------ | ------- | ------------ |
| `birdcc/bird2` | `alpine:latest` (stable) | `bird2` | 2.x          |
| `birdcc/bird3` | `alpine:edge`            | `bird`  | 3.x          |

Both images include `iproute2` for route debugging (`ip route`, `ip addr`, etc.).

## Quick Start

```bash
# Build both images
docker compose -f docker/compose.yml build

# Run BIRD2 daemon (foreground)
docker compose -f docker/compose.yml up bird2

# Run BIRD3 daemon (foreground)
docker compose -f docker/compose.yml up bird3
```

## Config Syntax Check (`bird -p`)

```bash
# Validate a BIRD2 config
docker compose -f docker/compose.yml run --rm bird2 -p -c /etc/bird.conf

# Validate a BIRD3 config
docker compose -f docker/compose.yml run --rm bird3 -p -c /etc/bird.conf

# Validate a custom config file
docker compose -f docker/compose.yml run --rm -v ./myconfig.conf:/etc/bird.conf:ro bird2 -p -c /etc/bird.conf
```

## Standalone Usage (without Compose)

```bash
# Build
docker build -t birdcc/bird2 docker/bird2/
docker build -t birdcc/bird3 docker/bird3/

# Run with custom config
docker run --rm --cap-add NET_ADMIN --cap-add NET_RAW \
  -v ./path/to/bird.conf:/etc/bird.conf:ro \
  birdcc/bird2

# Parse-check only
docker run --rm birdcc/bird2 -p -c /etc/bird.conf
```

## Security

- **Rootless**: runs as unprivileged `bird` user (created by Alpine package)
- **Read-only root filesystem**: only `/run/bird` is writable (for the control socket)
- **Minimal capabilities**: only `NET_ADMIN`, `NET_RAW`, `NET_BIND_SERVICE` — all others dropped
- **No shell access needed**: Alpine `--no-cache` keeps image minimal (~15 MB)
- **Memory limit**: 64 MB (configurable in `compose.yml`)

## File Structure

```
docker/
├── compose.yml         # Docker Compose orchestration
├── README.md           # This file
├── bird2/
│   ├── Dockerfile      # BIRD2 image (Alpine stable)
│   └── bird.conf       # Minimal sample config
└── bird3/
    ├── Dockerfile      # BIRD3 image (Alpine edge)
    └── bird.conf       # Minimal sample config
```
