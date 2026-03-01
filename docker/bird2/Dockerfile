# BIRD2 (v2.x) - Alpine stable
# Usage:
#   docker build -t birdcc/bird2 docker/bird2/
#   docker run --rm --cap-add NET_ADMIN --cap-add NET_RAW -v ./bird.conf:/etc/bird.conf:ro birdcc/bird2

FROM alpine:latest

RUN apk add --no-cache bird2 iproute2 \
    && mkdir -p /run/bird \
    && chown bird:bird /run/bird

# Read-only root FS friendly: only /run/bird needs write
VOLUME ["/run/bird"]

USER bird

ENTRYPOINT ["/usr/sbin/bird"]
CMD ["-f"]
