const vision = require('@google-cloud/vision')
const models = require('../../../../models')
const path = require('path')
const fs = require('fs/promises')
const backupdir = './backup'
const exifr = require('exifr')
const ffprobe = require('ffprobe')
const md5File = require('md5-file')
const ffmpeg = require('fluent-ffmpeg')
const { getSettings } = require('../../../settings/service')
const { rotationActions } = require('../../../../helpers')

module.exports = async job => {
	const { _id, width, height, rotated, source: oldPath, ff: ffOld } = job.data
	const aspect = width / height

	const video = ffOld.streams.some(({ duration_ts }) => duration_ts > 1)
	const settings = await getSettings()
	let newPath = path.join(settings.backupPath, _id + (video ? '.mp4' : '.webp'))

	try {
		const thumb = path.join(settings.backupPath, `${_id}.thumb.webp`)
		const thumbvideo = video ? path.join(settings.backupPath, `${_id}.thumb.mp4`) : null
		const rotation = rotationActions[rotated]
		const videoFilter = rotation
			? [Array(rotation.deg / 90).fill('transpose=1'), rotation.scaleX < 0 && 'hflip', rotation.scaleY < 0 && 'vflip'].flat().filter(val => val)
			: []

		job.progress(10)

		if (video) {
			const maxBitrate = Math.max(...ffOld.streams.map(({ bit_rate }) => parseFloat(bit_rate)))
			console.log({ maxBitrate })
			if (maxBitrate > 2000000) {
				await new Promise((res, rej) => ffmpeg().input(oldPath).videoCodec('h264_nvenc').on('error', rej).on('end', res).save(newPath))
				// await new Promise(res => {
				// 	const ls = spawn(
				// 		`ffmpeg.exe -i "${oldPath}" -pix_fmt yuv420p -f yuv4mpegpipe - | rav1e.exe - -s 4 --quantizer 80 --tile-cols 2 --tile-rows 2 -y --output "${newPath}"`,
				// 		{
				// 			stdio: 'inherit',
				// 			shell: true,
				// 		}
				// 	)

				// 	ls.on('exit', function (code) {
				// 		console.log('child process exited with code ' + code.toString())
				// 		res()
				// 	})
				// })
			} else {
				await fs.copyFile(oldPath, newPath)
			}

			job.progress(30)

			await new Promise((res, rej) =>
				ffmpeg()
					.input(oldPath)
					.videoCodec('h264_nvenc')
					.size('480x?')
					.noAudio()
					.outputFPS(30)
					.duration(5)
					.on('error', rej)
					.on('end', res)
					.save(thumbvideo)
			)
			job.progress(50)
		} else {
			await new Promise((res, rej) => ffmpeg().input(oldPath).videoFilter(videoFilter).on('error', rej).on('end', res).save(newPath))
			job.progress(50)
		}

		await new Promise((res, rej) =>
			ffmpeg().input(oldPath).videoFilter(videoFilter).size('220x?').frames(1).noAudio().on('error', rej).on('end', res).save(thumb)
		)

		job.progress(70)

		console.log({ oldPath, newPath })
		const hash = await md5File(newPath)
		const exif = await exifr.parse(newPath).catch(err => console.error('exif: ', err))
		const ffNew = await ffprobe(newPath, { path: './ffprobe.exe' }).catch(err => console.error('ff: ', err))
		await models.Photo.updateOne(
			{ _id },
			{
				thumb,
				thumbvideo,
				source: newPath,
				width: exif?.ExifImageWidth || ffNew?.streams?.[0]?.width,
				height: exif?.ExifImageHeight || ffNew?.streams?.[0]?.height,
				hash,
			}
		)

		// TODO: uncomment
		await fs.unlink(oldPath)
		return { oldPath, newPath, thumb, thumbvideo, ffNew }
	} catch (err) {
		console.log(err)
		if (!err.message.includes('Cannot find ffmpeg')) throw err
		newPath = path.join(settings.backupPath, _id + '.' + oldPath.split('.').pop())
		// TODO: replace with rename
		await fs.rename(oldPath, newPath)
		await models.Photo.updateOne({ _id }, { source: newPath })
		return { oldPath, newPath }
	}
}
