const Search = require('../service')
const express = require('express')
const fs = require('fs/promises')
const { createReadStream } = require('fs')

const router = express.Router()

router.get('/metadata', async (req, res, next) => {
	Search.getMetadata()
		.then(data => res.status(200).json(data))
		.catch(err => next(err))
})

router.get('/photo', async (req, res, next) => {
	Search.getPhotos(req.query)
		.then(data => res.status(200).json(data))
		.catch(err => next(err))
})

router.get('/sections', async (req, res, next) => {
	Search.getPhotos({ ...req.query, sections: true })
		.then(data => res.status(200).json(data))
		.catch(err => next(err))
})

router.get('/photo/:_id', async (req, res, next) => {
	Search.getPhoto({ ...req.query, ...req.params, type: 'source' })
		.then(data => (data ? res.status(200).sendFile(data) : res.sendStatus(404)))
		.catch(err => next(err))
})

router.get('/thumb/:_id', async (req, res, next) => {
	Search.getPhoto({ ...req.query, ...req.params, type: 'thumb' })
		.then(data => (data ? res.status(200).sendFile(data) : res.sendStatus(404)))
		.catch(err => next(err))
})

router.get('/thumbvideo/:_id', async (req, res, next) => {
	Search.getPhoto({ ...req.query, ...req.params, type: 'thumbvideo' })
		.then(async path => {
			if (!path) return res.sendStatus(404)
			const stat = await fs.stat(path)
			const fileSize = stat.size
			const head = {
				'Content-Length': fileSize,
				'Content-Type': 'video/mp4',
			}
			res.writeHead(200, head)
			createReadStream(path).pipe(res)
		})
		.catch(err => next(err))
})

router.get('/query/:text', async (req, res, next) => {
	Search.getPhotos({ ...req.params, ...req.query })
		.then(data => res.status(200).json(data))
		.catch(err => next(err))
})

module.exports = router
