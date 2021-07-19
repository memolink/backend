const { pick, isEqual } = require('lodash')
const models = require('../../../models')
const Redis = require('ioredis')
const pub = new Redis({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT })

async function updateSettings(settings) {
	const allowedSettings = pick(settings, 'backupPath', 'converters', 'vision', 'searchApiKey')
	const currentSettings = await models.Settings.findOne({}, Object.keys(allowedSettings))
	for (let key in allowedSettings)
		if (currentSettings?.hasOwnProperty(key) && isEqual(allowedSettings[key], currentSettings[key])) delete allowedSettings[key]
	await models.Settings.updateOne({}, allowedSettings, { upsert: true })
	for (let key in allowedSettings) pub.publish(`settings.${key}`, JSON.stringify(allowedSettings[key]))
	return true
}
async function getSettings() {
	return await models.Settings.findOne({})
}

module.exports = {
	updateSettings,
	getSettings,
}
