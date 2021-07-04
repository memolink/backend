const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
mongoose.set('useNewUrlParser', true)
mongoose.set('useFindAndModify', false)
mongoose.set('useCreateIndex', true)
mongoose.set('useUnifiedTopology', true)
mongoose.Promise = Promise
const { MONGOOSE_URL } = require('../config')

mongoose.connect(MONGOOSE_URL)

/**
 * @typedef {Object} models
 * @property {import('mongoose')} mongoose
 * @property {import('mongoose').Model} Photo
 * @property {import('mongoose').Model} Settings
 * @property {any} updateAc
 */

/**
 * @type models
 * @exports models
 */
module.exports = {
	mongoose,
	Photo: require('./Photo')(mongoose),
	Settings: require('./Settings')(mongoose),
}

mongoose.connection.once('open', function () {
	console.log('db connected!')
})
