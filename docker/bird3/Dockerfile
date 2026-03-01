# BIRD3 (v3.x) - Alpine edge
# Usage:
#   docker build -t birdcc/bird3 docker/bird3/
#   docker run --rm --cap-add NET_ADMIN --cap-add NET_RAW -v ./bird.conf:/etc/bird.conf:ro birdcc/bird3

FROM alpine:edge

RUN apk add --no-cache bird iproute2 \
    && mkdir -p /run/bird \
    && chown bird:bird /run/bird

# Read-only root FS friendly: only /run/bird needs write
VOLUME ["/run/bird"]

USER bird

ENTRYPOINT ["/usr/sbin/bird"]
CMD ["-f"]
