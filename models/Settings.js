/**
 *
 * @param {import('mongoose')} mongoose
 * @returns {import('mongoose').Model}
 */
module.exports = mongoose => {
	const schema = new mongoose.Schema({
		backupPath: { type: String, default: './backup' },
		converters: { type: [{ url: String, key: String }], default: null },
		lastScan: Date,
		lastScanCompleted: Date,
		vision: {
			client_email: String,
			private_key: String,
		},
		searchApiKey: String,
	})

	return mongoose.model('Settings', schema)
}
