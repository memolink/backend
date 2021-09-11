const Queue = require('bull')

const defaultOptions = {
	defaultJobOptions: {
		// lockDuration: 1000 * 60 * 10,
		timeout: 1000 * 60 * 2,
		attempts: 2,
		backoff: {
			type: 'fixed',
			delay: 5000,
		},
	},
	redis: {
		host: process.env.REDIS_HOST,
		port: process.env.REDIS_PORT,
	},
}

const photoQueue = new Queue('photo', {
	...defaultOptions,
	limiter: {
		max: 1800,
		duration: 1000 * 60,
	},
})

const detectQueue = new Queue('detect', {
	...defaultOptions,
})

const backupQueue = new Queue('backup', {
	...defaultOptions,
})

//;[detectQueue, photoQueue].forEach(queue => queue.obliterate({ force: true }))

module.exports = { photoQueue, detectQueue, backupQueue }
