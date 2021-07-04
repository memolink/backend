const models = require('../../../models')

async function updateSettings(settings) {
	await models.Settings.updateOne({}, settings, { upsert: true })
	return true
}
async function getSettings() {
	return await models.Settings.findOne({})
}

module.exports = {
	updateSettings,
	getSettings,
}
