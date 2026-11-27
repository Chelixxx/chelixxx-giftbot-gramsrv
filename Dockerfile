# syntax=docker/dockerfile:1.7

ARG GO_IMAGE=golang:1.26.11-alpine
ARG ALPINE_IMAGE=alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce
ARG UPSTREAM_COMMIT=3e04d96534939dcf957d262dab8ef106b45870fa

FROM ${GO_IMAGE} AS build

ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG UPSTREAM_COMMIT
ARG BUILD_DATE=unknown

RUN apk add --no-cache ca-certificates git
WORKDIR /src

RUN git init . \
    && git remote add origin https://github.com/iamxvbaba/gramsrv.git \
    && git fetch --depth=1 origin "${UPSTREAM_COMMIT}" \
    && git checkout --detach FETCH_HEAD

COPY patches/advertise-port.patch /tmp/advertise-port.patch
RUN git apply --check /tmp/advertise-port.patch \
    && git apply /tmp/advertise-port.patch

COPY patches/admin-emoji-system-packs.patch /tmp/admin-emoji-system-packs.patch
RUN git apply --check /tmp/admin-emoji-system-packs.patch \
    && git apply /tmp/admin-emoji-system-packs.patch

COPY patches/telegram-sticker-import.patch /tmp/telegram-sticker-import.patch
RUN git apply --check /tmp/telegram-sticker-import.patch \
    && git apply /tmp/telegram-sticker-import.patch

COPY patches/telegram-sticker-import-bot.patch /tmp/telegram-sticker-import-bot.patch
RUN git apply --check /tmp/telegram-sticker-import-bot.patch \
    && git apply /tmp/telegram-sticker-import-bot.patch

COPY patches/telegram_sticker_import_bot.go /tmp/telegram_sticker_import_bot.go
RUN install -D -m 0644 /tmp/telegram_sticker_import_bot.go /src/internal/app/files/telegram_sticker_import_bot.go

COPY patches/telegram_sticker_import.go /tmp/telegram_sticker_import.go
RUN install -D -m 0644 /tmp/telegram_sticker_import.go /src/internal/app/files/telegram_sticker_import.go

# VOLTRA promo redemption: authenticated MTProto self-chat command, shared
# public registry validation, and atomic per-user Stars ledger credit.
COPY patches/voltra-promo.patch /tmp/voltra-promo.patch
RUN git apply --check /tmp/voltra-promo.patch \
    && git apply /tmp/voltra-promo.patch

COPY patches/voltra_promo_domain.go /tmp/voltra_promo_domain.go
COPY patches/voltra_promo_service.go /tmp/voltra_promo_service.go
COPY patches/voltra_promo_store.go /tmp/voltra_promo_store.go
COPY patches/voltra_promo_rpc.go /tmp/voltra_promo_rpc.go
COPY patches/20261127010000_voltra_promo_claims.up.sql /tmp/20261127010000_voltra_promo_claims.up.sql
COPY patches/20261127010000_voltra_promo_claims.down.sql /tmp/20261127010000_voltra_promo_claims.down.sql
RUN install -D -m 0644 /tmp/voltra_promo_domain.go /src/internal/domain/voltra_promo.go \
    && install -D -m 0644 /tmp/voltra_promo_service.go /src/internal/app/stars/voltra_promo.go \
    && install -D -m 0644 /tmp/voltra_promo_store.go /src/internal/store/postgres/voltra_promo.go \
    && install -D -m 0644 /tmp/voltra_promo_rpc.go /src/internal/rpc/voltra_promo.go \
    && install -D -m 0644 /tmp/20261127010000_voltra_promo_claims.up.sql /src/deploy/migrations/20261127010000_voltra_promo_claims.up.sql \
    && install -D -m 0644 /tmp/20261127010000_voltra_promo_claims.down.sql /src/deploy/migrations/20261127010000_voltra_promo_claims.down.sql

# Fetch the official star-gift snapshot separately: the pinned gramsrv source
# commit contains the catalog reader but intentionally does not vendor the
# large, periodically refreshed official-gifts data directory.
RUN git clone --depth=1 --filter=blob:none --sparse https://github.com/FromGram/server.git /tmp/fromgram \
    && git -C /tmp/fromgram sparse-checkout set data/official-gifts \
    && mkdir -p /src/data \
    && cp -a /tmp/fromgram/data/official-gifts /src/data/official-gifts \
    && test -s /src/data/official-gifts/manifest.json \
    && rm -rf /tmp/fromgram

# Bundle Telegram's default/featured sticker, custom-emoji, and reaction seed
# data. The upstream server imports it idempotently into PostgreSQL/blob storage
# at startup through TELESRV_STICKER_SEED_DIR.
RUN git clone --depth=1 --filter=blob:none --sparse https://github.com/owpengram/owpengram-server.git /tmp/owpengram \
    && git -C /tmp/owpengram sparse-checkout set data/sticker-seed \
    && cp -a /tmp/owpengram/data/sticker-seed /src/data/sticker-seed \
    && test -d /src/data/sticker-seed/telegram_default_stickers_export \
    && test -d /src/data/sticker-seed/telegram_reactions_export \
    && rm -rf /tmp/owpengram

ENV CGO_ENABLED=0
RUN go mod download

RUN GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build -trimpath \
      -ldflags="-s -w -X main.gitCommit=${UPSTREAM_COMMIT} -X main.gitBranch=main -X main.gitTreeState=clean -X main.buildTime=${BUILD_DATE}" \
      -o /out/telesrv ./cmd/telesrv

# Build the admin console from the same pinned source and patched read-store query.
FROM build AS build-admin
RUN apk add --no-cache nodejs npm
WORKDIR /src/cmd/telesrv-admin/web
RUN npm ci && npm run build
WORKDIR /src
RUN GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    go build -trimpath -ldflags="-s -w" -o /out/telesrv-admin ./cmd/telesrv-admin

FROM ${ALPINE_IMAGE} AS admin

RUN apk add --no-cache ca-certificates tzdata su-exec \
    && addgroup -S -g 10001 telesrv \
    && adduser -S -D -H -u 10001 -G telesrv telesrv \
    && install -d -o telesrv -g telesrv -m 0750 /app /var/lib/telesrv/identity

COPY --from=build-admin /out/telesrv-admin /usr/local/bin/telesrv-admin
COPY --chmod=0555 docker-entrypoint.sh /usr/local/bin/telesrv-container-entrypoint

WORKDIR /app
USER root
EXPOSE 2600
ENTRYPOINT ["/usr/local/bin/telesrv-container-entrypoint"]
CMD ["telesrv-admin"]

FROM ${ALPINE_IMAGE} AS server

RUN apk add --no-cache ca-certificates tzdata ffmpeg openssl su-exec \
    && addgroup -S -g 10001 telesrv \
    && adduser -S -D -H -u 10001 -G telesrv telesrv \
    && install -d -o telesrv -g telesrv -m 0750 \
      /app \
      /var/lib/telesrv \
      /var/lib/telesrv/blobs \
      /var/lib/telesrv/blob-staging \
      /var/lib/telesrv/maptiles \
      /var/lib/telesrv/identity \
      /var/lib/telesrv/livestream \
      /usr/share/telesrv/langpack \
    && install -d -o telesrv -g telesrv -m 0700 /var/lib/telesrv/wallet

COPY --from=build /out/telesrv /usr/local/bin/telesrv
COPY --from=build --chown=telesrv:telesrv /src/data/langpack/ /usr/share/telesrv/langpack/
COPY --from=build --chown=telesrv:telesrv /src/data/official-gifts/ /app/official-gifts/
COPY --from=build --chown=telesrv:telesrv /src/data/sticker-seed/ /app/sticker-seed/
COPY --chmod=0555 docker-entrypoint.sh /usr/local/bin/telesrv-container-entrypoint

WORKDIR /app

ENV TELESRV_RSA_KEY=/var/lib/telesrv/server_rsa.pem \
    TELESRV_BLOB_DIR=/var/lib/telesrv/blobs \
    TELESRV_BLOB_STAGING_DIR=/var/lib/telesrv/blob-staging \
    TELESRV_IDENTITY_DIR=/var/lib/telesrv/identity \
    TELESRV_MAPTILE_CACHE_DIR=/var/lib/telesrv/maptiles \
    TELESRV_OFFICIAL_GIFTS_DIR=/app/official-gifts \
    TELESRV_STICKER_SEED_DIR=/app/sticker-seed

# The entrypoint fixes mounted volume ownership, then drops privileges.
USER root

EXPOSE 2398 2400 2401 2599 12399/udp 12400/udp

ENTRYPOINT ["/usr/local/bin/telesrv-container-entrypoint"]
CMD ["telesrv"]
