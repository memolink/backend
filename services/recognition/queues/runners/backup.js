const models = require('../../../../models')
const path = require('path')
const fs = require('fs/promises')
const exifr = require('exifr')
const md5File = require('md5-file')
const ffmpeg = require('fluent-ffmpeg')
const { rotationActions, ffprobe } = require('../../../../helpers')
const Redis = require('ioredis')
const sub = new Redis()

let backupPath

sub.subscribe('settings.backupPath', err => err && console.error('redis error subscribing to settings.backupPath: ', err))
sub.on('message', (channel, message) => (backupPath = JSON.parse(message)))

function ffmpegRun(ff, output) {
	return new Promise((res, rej) => {
		let command = null

		ff.on('start', cmd => (command = cmd))
			.on('end', res)
			.on('error', err => {
				err.message += ' during command: ' + command
				rej(err)
			})
			.save(output)
	})
}

module.exports = async job => {
	if (backupPath === undefined) {
		const settings = await models.Settings.findOne({}, 'backupPath')
		backupPath = settings.backupPath
	}

	const { _id, width, height, rotated, source: oldPath, ff: ffOld } = job.data

	const video = ffOld.streams.some(({ duration_ts }) => duration_ts > 1)
	let newPath = path.join(backupPath, _id + (video ? '.mp4' : '.webp'))

	try {
		const thumb = path.join(backupPath, `${_id}.thumb.webp`)
		const thumbvideo = video ? path.join(backupPath, `${_id}.thumb.mp4`) : null
		const rotation = rotationActions[rotated]
		const videoFilter = rotation
			? [Array(rotation.deg / 90).fill('transpose=1'), rotation.scaleX < 0 && 'hflip', rotation.scaleY < 0 && 'vflip'].flat().filter(val => val)
			: []

		job.progress(10)

		if (video) {
			const maxBitrate = Math.max(...ffOld.streams.map(({ bit_rate }) => parseFloat(bit_rate)))
			console.log({ maxBitrate })
			if (maxBitrate > 2000000) {
				await ffmpegRun(ffmpeg().input(oldPath).videoCodec('h264_nvenc'), newPath)
			} else {
				await fs.copyFile(oldPath, newPath)
			}

			job.progress(30)

			await ffmpegRun(ffmpeg().input(oldPath).videoCodec('h264_nvenc').size('480x?').noAudio().outputFPS(30).duration(5), thumbvideo)
			job.progress(50)
		} else {
			await ffmpegRun(ffmpeg().input(oldPath).videoFilter(videoFilter), newPath)
			job.progress(50)
		}

		await ffmpegRun(ffmpeg().input(oldPath).videoFilter(videoFilter).size('220x?').frames(1).noAudio(), thumb)

		job.progress(70)

		console.log({ oldPath, newPath })
		const hash = await md5File(newPath)
		const exif = await exifr.parse(newPath).catch(err => console.error('exif: ', err))
		const ffNew = await ffprobe(newPath).catch(err => console.error('ff: ', err))
		await models.Photo.updateOne(
			{ _id },
			{
				thumb,
				thumbvideo,
				source: newPath,
				width: exif?.ExifImageWidth || ffNew?.streams?.[0]?.width,
				height: exif?.ExifImageHeight || ffNew?.streams?.[0]?.height,
				hash,
				backup: true,
			}
		)

		// TODO: uncomment
		await fs.unlink(oldPath)
		return { oldPath, newPath, thumb, thumbvideo, ffNew }
	} catch (err) {
		console.log(err)
		if (err.message.includes('No such file or directory') || err.message.includes('ENOENT')) return err
		if (!err.message.includes('Cannot find ffmpeg')) throw err
		newPath = path.join(backupPath, _id + '.' + oldPath.split('.').pop())
		// TODO: replace with rename
		await fs.rename(oldPath, newPath)
		await models.Photo.updateOne({ _id }, { source: newPath })
		return { oldPath, newPath }
	}
}
