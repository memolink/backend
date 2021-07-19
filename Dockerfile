FROM node:14-alpine

USER root

RUN mkdir -p /home/node/app/node_modules
RUN mkdir -p /sync/example && chown -R 1000: /sync
RUN chown -R 1000: /home/node/app

WORKDIR /home/node/app
COPY package*.json ./
USER 1000
# RUN npm ci --only=production
RUN npm install
# COPY . .
COPY --chown=1000: . .

EXPOSE 8080

CMD [ "npm", "run", "dev" ]