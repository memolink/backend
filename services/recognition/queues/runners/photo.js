const vision = require('@google-cloud/vision')
const models = require('../../../../models')
const fs = require('fs/promises')
const exifr = require('exifr')
const md5File = require('md5-file')
const { backupQueue } = require('..')
const { rotationActions, ffprobe } = require('../../../../helpers')
const Redis = require('ioredis')
const sub = new Redis()
let client

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

// should be called on settings.vision update
async function updateClient({ client_email, private_key } = {}) {
	if (!client_email || !private_key) {
		const settings = await models.Settings.findOne({}, 'vision')
		;({ client_email, private_key } = settings?.vision || {})
	}

	if (!client_email || !private_key) client = false
	else
		client = new vision.ImageAnnotatorClient({
			credentials: { client_email, private_key },
		})
}

sub.subscribe('settings.vision', err => err && console.error('redis error subscribing to settings.vision: ', err))
sub.on('message', (channel, message) => updateClient(JSON.parse(message)))

module.exports = async function (job) {
	if (client === undefined) await updateClient()

	const { filePath, hash } = job.data
	if (!hash) hash = await md5File(filePath)

	const hashDuplicate = await models.Photo.findOne({ $or: [{ hash }, { originalHash: hash }] })
	if (hashDuplicate) return { filePath, hashDuplicate }

	const exif = await exifr.parse(filePath).catch(err => console.error('exif: ', err, filePath))
	const rotated = rotations[exif?.Orientation] || null
	const ff = await ffprobe(filePath).catch(err => console.error('ff: ', err))
	if (!ff && !exif) {
		await fs.unlink(filePath)
		return { filePath, notMedia: true }
	}

	const stat = await fs.stat(filePath).catch(err => console.error('stat: ', err))
	//console.log(util.inspect({ exif, ff, stat }, { showHidden: false, depth: null }))
	job.progress(30)
	let tags
	if (!exif) {
		tags = false
	} else if (!client) {
		tags = null
	} else {
		await client
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
			.then(result => (tags = result?.[0]?.labelAnnotations || false))
	}

	job.progress(70)

	const video = ff?.streams?.some(({ duration_ts }) => duration_ts > 1)

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
		{ new: true, upsert: true }
	)

	backupQueue.add({ ff, width, height, rotated, _id: photo._id, source: filePath })
	return photo
}
