FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/ePlus-DEV/muse-invite-hub"
LABEL org.opencontainers.image.description="Muse Invite Hub Telegram webhook for OCI Ampere ARM64"
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node telegram/bot.mjs telegram/github.mjs telegram/server.mjs ./telegram/
USER node
EXPOSE 3000
CMD ["node","telegram/server.mjs"]
