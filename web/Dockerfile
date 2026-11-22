FROM node:22-alpine AS build
RUN apk add --no-cache bash git
RUN npm install --global pnpm@9.15.3
WORKDIR /app
COPY . .
RUN bash ./build.sh

FROM nginx:1.27-alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
