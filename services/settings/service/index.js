const { pick, isEqual } = require('lodash')
const models = require('../../../models')
const Redis = require('ioredis')
const pub = new Redis()

async function updateSettings(settings) {
	const allowedSettings = pick(settings, 'backupPath', 'syncthing', 'vision', 'searchApiKey')
	const currentSettings = await models.Settings.findOne({}, Object.keys(allowedSettings))
	for (let key in allowedSettings) if (isEqual(allowedSettings[key], currentSettings[key])) delete allowedSettings[key]
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
