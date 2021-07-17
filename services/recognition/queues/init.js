const { photoQueue, detectQueue, backupQueue } = require('./index')
const path = require('path')
const models = require('../../../models')

const addHandlers = queue =>
	queue
		.on('error', (a, b, c) => console.log('error', a, b, c))
		// .on('waiting', (a, b, c) => console.log('waiting', a, b, c))
		// .on('active', (a, b, c) => console.log('active', a, b, c))
		// .on('stalled', (a, b, c) => console.log('stalled', a, b, c))
		// .on('progress', (a, b, c) => console.log('progress', a, b, c))
		// .on('completed', (a, b, c) => console.log('completed', a, b, c))
		// .on('paused', (a, b, c) => console.log('paused', a, b, c))
		// .on('resumed', (a, b, c) => console.log('resumed', a, b, c))
		// .on('cleaned', (a, b, c) => console.log('cleaned', a, b, c))
		// .on('removed', (a, b, c) => console.log('removed', a, b, c))
		.on('failed', (a, b, c) => console.log('failed', a, b, c))

const queues = { photoQueue, detectQueue, backupQueue }

Object.keys(queues).forEach(queueName => {
	const otherQueues = Object.keys(queues).filter(queue => queue !== queueName)

	queues[queueName].on('drained', async () => {
		const counts = await Promise.all(otherQueues.map(queueName => queues[queueName].getJobCounts()))
		console.log({ drained: queueName, counts })
		if (counts.reduce((sum, { waiting, active, completed, failed, delayed }) => sum + waiting + active + delayed, 0) !== 0) return
		await models.Settings.updateOne({}, { lastScanCompleted: new Date() })
	})
})

photoQueue.process(1, path.resolve('./services/recognition/queues/runners/photo.js'))
detectQueue.process(1, path.resolve('./services/recognition/queues/runners/detect.js'))
backupQueue.process(1, path.resolve('./services/recognition/queues/runners/backup.js'))
