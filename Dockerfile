FROM node:14-alpine

RUN apk add  --no-cache ffmpeg

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app
COPY package*.json ./
USER node
# RUN npm ci --only=production
RUN npm install
# COPY . .
COPY --chown=node:node . .

EXPOSE 8080

CMD [ "npm", "run start" ]