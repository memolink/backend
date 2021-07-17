const md5File = require('md5-file')
const models = require('../../../../models')
const { photoQueue } = require('..')
const fs = require('fs/promises')

module.exports = async function ({ data: { files }, ...job }) {
	const hashes = []
	const failedFiles = []
	let count = 0
	for (let filePath of files) {
		try {
			hashes.push({ filePath, hash: await md5File(filePath) })
		} catch (error) {
			failedFiles.push({ filePath, error })
		}
		count++
		job.progress(count / files.length)
	}
	// const hashes = {}
	// for (let file of files) {
	// 	const filePath = path.join(tempdir, file)
	// 	hashes[filePath] = await md5File(filePath)
	// }
	const uploadedFiles = await models.Photo.find(
		{
			$or: [{ hash: { $in: hashes.map(({ hash }) => hash) } }, { originalHash: { $in: hashes.map(({ hash }) => hash) } }],
			backup: true,
		},
		['hash', 'originalHash']
	)
	const uploadedHashes = uploadedFiles.flatMap(({ hash, originalHash }) => [hash, originalHash])
	const newFiles = []
	for (let { hash, filePath } of hashes) {
		if (uploadedHashes.includes(hash)) await fs.unlink(filePath)
		else newFiles.push({ hash, filePath })
	}
	console.log('hashes', hashes.length, 'uploadedHashes', uploadedHashes.length, 'newFiles', newFiles.length)

	await photoQueue.addBulk(newFiles.map(data => ({ data })))

	return { hashes, uploadedHashes, newFiles, failedFiles }
}
