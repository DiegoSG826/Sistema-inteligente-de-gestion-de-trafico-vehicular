FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 APP_AUTH_FILE=/run/secrets/traffic_auth
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "const http=require('node:http');const u=new URL(process.env.APP_ORIGIN);http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/healthz',headers:{host:u.host}},r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "server.js"]
