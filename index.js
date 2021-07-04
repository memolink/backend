require('dotenv').config()
const http = require('http')
const express = require('express')
const morgan = require('morgan')
const { createBullBoard } = require('@bull-board/api')
const { BullAdapter } = require('@bull-board/api/bullAdapter')
const { ExpressAdapter } = require('@bull-board/express')

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/api/queues')

const queues = [...Object.values(require('./services/recognition/queues/index.js'))].map(queue => new BullAdapter(queue))
const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
	queues,
	serverAdapter: serverAdapter,
})

const app = express()
app.use(morgan('tiny'))
app.use(express.json())
app.use('/queues', serverAdapter.getRouter())
const server = http.createServer(app)
app.set('port', 3001)

require('./services/recognition/queues/init.js')
const recognition = require('./services/recognition/service')
const search = require('./services/search/routes')
const settings = require('./services/settings/routes')
app.use('/search', search)
app.use('/settings', settings)

//getEntities('Ford').then(console.log)

server.listen(app.get('port'), () => console.log(`listening on ${app.get('port')}`))
