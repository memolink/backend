/**
 *
 * @param {import('mongoose')} mongoose
 * @returns {import('mongoose').Model}
 */
module.exports = mongoose => {
	const schema = new mongoose.Schema({
		backupPath: {
			type: String,
			default: './backup',
		},
		lastScan: Date,
		lastScanCompleted: Date,
		syncthing: {
			host: { type: String, default: 'localhost' },
			port: { type: String, default: '8384' },
			apiKey: String,
			importFolders: [String],
		},
		vision: {
			client_email: String,
			private_key: String,
		},
		searchApiKey: String,
	})

	return mongoose.model('Settings', schema)
}
