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
		importPaths: [String],
		syncthing: {
			host: { type: String, default: 'localhost' },
			port: { type: String, default: '8384' },
			apiKey: String,
			importFolders: [String],
			lastScan: Date,
			lastScanCompleted: Date,
		},
	})

	return mongoose.model('Settings', schema)
}
