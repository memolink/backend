const Queue = require('bull')

const photoQueue = new Queue('photo', {
	defaultJobOptions: {
		attempts: 15,
		backoff: {
			delay: 5000,
		},
	},
	limiter: {
		max: 1800,
		duration: 1000 * 60,
	},
})

const detectQueue = new Queue('detect', {
	defaultJobOptions: {
		lockDuration: 1000 * 60 * 5,
		attempts: 15,
		backoff: {
			type: 'fixed',
			delay: 5000,
		},
	},
})

const backupQueue = new Queue('backup', {
	defaultJobOptions: {
		lockDuration: 1000 * 60 * 10,
		attempts: 15,
		backoff: {
			type: 'fixed',
			delay: 5000,
		},
	},
})

//;[detectQueue, photoQueue].forEach(queue => queue.obliterate({ force: true }))

module.exports = { photoQueue, detectQueue, backupQueue }
