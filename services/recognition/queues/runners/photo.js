const vision = require('@google-cloud/vision')
const models = require('../../../../models')
const fs = require('fs/promises')
const exifr = require('exifr')
const md5File = require('md5-file')
const { backupQueue } = require('..')
const { rotationActions, getMediaInfo } = require('../../../../helpers')
const Redis = require('ioredis')
const { max, map } = require('lodash')
const sub = new Redis({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT })
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

	const stat = await fs.stat(filePath)
	const exif = await exifr.parse(filePath).catch(err => console.error('exif: ', err, filePath))
	const rotated = rotations[exif?.Orientation] || null
	const mediaInfo = await getMediaInfo(filePath)
	if (['ImageCount', 'VideoCount'].reduce((total, countType) => total + (+mediaInfo.general[countType] || 0), 0) < 1) {
		await fs.unlink(filePath)
		return { filePath, notMedia: true }
	}

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

	const video = +mediaInfo.general.VideoCount > 0

	const dimensions = [exif?.ExifImageWidth || max(map(mediaInfo.tracks, 'Width')), exif?.ExifImageHeight || max(map(mediaInfo.tracks, 'Height'))]
	if (rotationActions?.[rotated]?.dimensionSwapped) dimensions.reverse()
	const [width, height] = dimensions

	let coordinates
	if (exif?.longitude && exif?.latitude) {
		coordinates = [exif.longitude, exif.latitude]
	} else if (mediaInfo.general?.extra?.xyz) {
		coordinates = mediaInfo.general.extra.xyz.split('+').map(parseFloat)
		if (coordinates.length === 3) coordinates.shift()
		coordinates.reverse()
	}

	const photo = await models.Photo.findOneAndUpdate(
		{ originalHash: hash },
		{
			video,
			width,
			height,
			date: exif?.CreateDate || mediaInfo.general.Encoded_Date || stat?.mtime,
			location: coordinates && {
				type: 'Point',
				coordinates,
			},
			source: filePath,
			originalSource: filePath,
			hash,
			originalHash: hash,
			tags,
			metadata: exif,
			mediaInfo,
		},
		{ new: true, upsert: true }
	)

	backupQueue.add(
		{
			width,
			height,
			_id: photo._id,
			source: filePath,
			video,
			streamable: mediaInfo.general.IsStreamable !== 'No',
			bitrate: parseInt(mediaInfo.general.OverallBitRate),
		},
		{ jobId: hash }
	)

	return photo
}
