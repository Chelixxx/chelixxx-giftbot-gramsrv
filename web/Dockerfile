FROM node:20-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
RUN git clone --depth 1 --branch master https://github.com/iamxvbaba/gramsrv-tweb.git .
RUN corepack enable
ARG VITE_TELESRV_DC_HOST=voltra-server-production.up.railway.app
ARG VITE_TELESRV_DC_PORT=443
ARG VITE_TELESRV_WS_PATH=/apiws
ARG VITE_TELESRV_API_ID=17349
ARG VITE_TELESRV_API_HASH=voltra-web-client
ENV VITE_TELESRV_DC_HOST=${VITE_TELESRV_DC_HOST}
ENV VITE_TELESRV_DC_PORT=${VITE_TELESRV_DC_PORT}
ENV VITE_TELESRV_WS_PATH=${VITE_TELESRV_WS_PATH}
ENV VITE_TELESRV_API_ID=${VITE_TELESRV_API_ID}
ENV VITE_TELESRV_API_HASH=${VITE_TELESRV_API_HASH}
RUN pnpm install --no-frozen-lockfile
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
