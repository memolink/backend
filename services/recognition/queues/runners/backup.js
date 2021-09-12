const models = require('../../../../models')
const path = require('path')
const { createReadStream, createWriteStream } = require('fs')
const fs = require('fs/promises')
const md5File = require('md5-file')
const axios = require('axios').default
const { promisify } = require('util')
const stream = require('stream')
const finished = promisify(stream.finished)
const Redis = require('ioredis')
const sub = new Redis({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT })

let backupPath
let converters
let nextConverter = 0

sub.subscribe(['settings.backupPath', 'settings.converters'], err => err && console.error('redis error subscribing to settings.backupPath: ', err))
sub.on('message', (channel, message) => {
	if (channel === 'settings.backupPath') {
		backupPath = JSON.parse(message)
	} else if (channel === 'settings.converters') {
		converters = JSON.parse(converters)
		nextConverter = 0
	}
})

module.exports = async job => {
	if (backupPath === undefined || converters === undefined) {
		const settings = await models.Settings.findOne({}, ['backupPath', 'converters'])
		;({ backupPath, converters } = settings)
	}

	if (!backupPath) throw new Error('Backup path not specified')

	const { _id, width, height, source: oldPath, video, bitrate } = job.data

	if (!converters || converters.length < 1) {
		console.log('no converters found, copying source file')
		const newPath = path.join(backupPath, _id + '.' + oldPath.split('.').pop())
		await fs.rename(oldPath, newPath)
		await models.Photo.updateOne({ _id }, { source: newPath })
		return { oldPath, newPath }
	}

	const newPath = path.join(backupPath, _id + (video ? '.mp4' : '.webp'))
	const thumb = path.join(backupPath, `${_id}.thumb.webp`)
	const thumbvideo = video ? path.join(backupPath, `${_id}.thumb.mp4`) : null

	job.progress(10)

	const presets = { thumb }
	if (video) {
		presets.thumbvideo = thumbvideo

		if (bitrate > 2000000) presets.full = newPath
		else await fs.copyFile(oldPath, newPath)
	} else {
		presets.full = newPath
	}

	const converter = converters[nextConverter]
	nextConverter = (nextConverter + 1) % converters.length

	const convertResult = await axios.post(`${converter.url}/convert/${video ? 'video' : 'photo'}`, createReadStream(oldPath), {
		params: { presets: Object.keys(presets) },
		headers: { Authorization: converter.key },
		maxBodyLength: Infinity,
	})

	const tempId = convertResult?.data?.id
	if (!tempId) throw new Error('Converter error: ', JSON.stringify(convertResult.data))

	// TODO: track progress

	await Promise.all(
		Object.entries(presets).map(async ([preset, output]) => {
			const writeStream = createWriteStream(output)

			const file = await axios.get(`${converter.url}/temp/${tempId}/${preset}`, {
				headers: { Authorization: converter.key },
				responseType: 'stream',
			})

			file.data.pipe(writeStream)

			return finished(writeStream)
		})
	)

	job.progress(90)

	console.log({ oldPath, newPath })
	const hash = await md5File(newPath)
	// const exif = await exifr.parse(newPath).catch(err => console.error('exif: ', err))
	await models.Photo.updateOne(
		{ _id },
		{
			thumb,
			thumbvideo,
			source: newPath,
			hash,
			backup: true,
		}
	)

	await fs.unlink(oldPath)

	await axios.post(
		`${converter.url}/temp/${tempId}/cleanup`,
		{},
		{
			headers: { Authorization: converter.key },
		}
	)

	return { oldPath, newPath, thumb, thumbvideo }
}
