const vision = require('@google-cloud/vision')
const models = require('../../../../models')
const fs = require('fs/promises')
const exifr = require('exifr')
const ffprobe = require('ffprobe')
const md5File = require('md5-file')
const client = new vision.ImageAnnotatorClient({
	keyFilename: process.env.key_file,
	credentials: process.env.client_email && { client_email: process.env.client_email, private_key: process.env.private_key },
})
const Redis = require('ioredis')
const redis = new Redis()
const { backupQueue } = require('..')
const { rotationActions } = require('../../../../helpers')

const rotations = {
	'Horizontal (normal)': 1,
	'Mirror horizontal': 2,
	'Rotate 180': 3,
	'Mirror vertical': 4,
	'Mirror horizontal and rotate 270 CW': 5,
	'Rotate 90 CW': 6,
	'Mirror horizontal and rotate 90 CW': 7,
	'Rotate 270 CW': 8,
}

module.exports = async function (job) {
	const { filePath, hash } = job.data
	if (!hash) hash = await md5File(filePath)
	// const hashDuplicate = await models.Photo.findOne({ $or: [{ hash }, { originalHash: hash }] })
	// if (hashDuplicate) return { filePath, hashDuplicate }

	const exif = await exifr.parse(filePath).catch(err => console.error('exif: ', err, filePath))
	const rotated = rotations[exif?.Orientation] || null

	const ff = await ffprobe(filePath, { path: './ffprobe.exe' }).catch(err => console.error('ff: ', err))
	const stat = await fs.stat(filePath).catch(err => console.error('stat: ', err))
	//console.log(util.inspect({ exif, ff, stat }, { showHidden: false, depth: null }))
	job.progress(30)
	// const tags = []
	const [{ labelAnnotations: tags }] = exif
		? await client
				.annotateImage({
					image: {
						source: {
							filename: filePath,
						},
					},
					features: [
						{
							type: 'LABEL_DETECTION',
							maxResults: 15,
						},
					],
				})
				.catch(err => console.error(err))
		: [{}]

	job.progress(70)

	const video = ff.streams.some(({ duration_ts }) => duration_ts > 1)

	const dimensions = [exif?.ExifImageWidth || ff?.streams?.[0]?.width, exif?.ExifImageHeight || ff?.streams?.[0]?.height]
	if (rotationActions?.[rotated]?.dimensionSwapped) dimensions.reverse()
	const [width, height] = dimensions

	const photo = await models.Photo.findOneAndUpdate(
		{ originalHash: hash },
		{
			video,
			rotated,
			width,
			height,
			date: exif?.CreateDate || ff?.streams?.[0]?.tags?.creation_time || stat?.mtime,
			location:
				exif?.longitude && exif?.latitude
					? {
							type: 'Point',
							coordinates: [exif.longitude, exif.latitude],
					  }
					: null,
			source: filePath,
			originalSource: filePath,
			hash,
			originalHash: hash,
			tags,
			metadata: exif,
		},
		{ new: true }
	)
	if (!photo) return 'not found hash'

	console.log(photo)
	backupQueue.add({ ff, width, height, rotated, _id: photo._id, source: filePath })
	return photo
}
