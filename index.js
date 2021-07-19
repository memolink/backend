require('dotenv').config()
const http = require('http')
const express = require('express')
const morgan = require('morgan')
const { createBullBoard } = require('@bull-board/api')
const { BullAdapter } = require('@bull-board/api/bullAdapter')
const { ExpressAdapter } = require('@bull-board/express')
const queues = require('./services/recognition/queues/index.js')

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/queues')

//queues.backupQueue.removeJobs('bf5cb6a493f84ecec2d789f9af409dd5')

createBullBoard({
	queues: Object.values(queues).map(queue => new BullAdapter(queue)),
	serverAdapter: serverAdapter,
})

const app = express()
app.use('/queues', serverAdapter.getRouter())
app.use(morgan('tiny'))
app.use(express.json())
const server = http.createServer(app)
app.set('port', process.env.PORT || 3001)

require('./services/recognition/queues/init.js')
require('./services/recognition/service')

const search = require('./services/search/routes')
const settings = require('./services/settings/routes')
app.use('/search', search)
app.use('/settings', settings)

//getEntities('Ford').then(console.log)

server.listen(app.get('port'), () => console.log(`listening on ${app.get('port')}`))
