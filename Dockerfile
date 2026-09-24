# Deployment example; not built/qualified in the release environment.
# Pin a reviewed maintained base-image digest before production use.
FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 CIVORA_DATA_DIR=/var/lib/civora
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /var/lib/civora && chown node:node /var/lib/civora
USER node
EXPOSE 8787
VOLUME ["/var/lib/civora"]
STOPSIGNAL SIGTERM
CMD ["node", "server/index.mjs"]
