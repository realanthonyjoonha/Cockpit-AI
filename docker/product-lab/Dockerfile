# Product lab — blank product E2E (no research books in image).
# Mount product tree at runtime. Decision-support only.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash git ca-certificates curl rsync \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work

COPY docker/product-lab/entrypoint-test.sh /entrypoint-test.sh
COPY docker/product-lab/entrypoint-glass.sh /entrypoint-glass.sh
COPY docker/product-lab/guards.sh /guards.sh
COPY docker/product-lab/smoke-http.sh /smoke-http.sh
COPY scripts/lab-feature-hooks /lab-feature-hooks

RUN chmod +x /entrypoint-test.sh /entrypoint-glass.sh /guards.sh /smoke-http.sh \
  && chmod +x /lab-feature-hooks/*.sh 2>/dev/null || true

ENV LAB_PORT=4690 \
    HOST=0.0.0.0 \
    COCKPIT_ENV_QUIET=1

ENTRYPOINT ["/entrypoint-test.sh"]
