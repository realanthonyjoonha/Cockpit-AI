# Isolated environment to verify DEVELOP.md wiring + product/kernel separation.
# Does not include Anthony research books. Decision-support only.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work

# Entrypoint runs the discipline test against mounted trees.
COPY docker/develop-discipline/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
