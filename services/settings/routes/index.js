const Settings = require('../service')
const express = require('express')

const router = express.Router()

router.get('/', async (req, res, next) => {
	Settings.getSettings()
		.then(data => res.status(200).json(data))
		.catch(err => next(err))
})

router.put('/', async (req, res, next) => {
	Settings.updateSettings(req.body)
		.then(data => res.status(200).json(data))
		.catch(err => next(err))
})

module.exports = router
