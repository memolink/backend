const vision = require('@google-cloud/vision')
const models = require('../../../models')
const path = require('path')
const fs = require('fs/promises')
const backupdir = './backup'
const tempdir = './temp'
const exifr = require('exifr')
const ffprobe = require('ffprobe')
const md5File = require('md5-file')
const syncthing = require('node-syncthing')
const ffmpeg = require('fluent-ffmpeg')
const { photoQueue, detectQueue } = require('../queues')
const Redis = require('ioredis')
const { isEqual, pick } = require('lodash')
const redis = new Redis()
const threads = require('os').cpus().length

async function getFiles(dir) {
	const dirents = await fs.readdir(dir, { withFileTypes: true })
	const files = await Promise.all(
		dirents.map(dirent => {
			const res = path.resolve(dir, dirent.name)
			return dirent.isDirectory() ? getFiles(res) : res
		})
	)
	return files.flat()
}

function getDbFiles(files, targetTime = new Date(0)) {
	return files
		.map(file => {
			return file?.children
				? getDbFiles(
						file.children.map(({ name, ...rest }) => ({ ...rest, name: path.join(file.name, name) })),
						targetTime
				  )
				: file
		})
		.flat()
		.filter(({ modTime, type }) => type === 'FILE_INFO_TYPE_FILE' && new Date(modTime) >= targetTime)
}

function* chunks(arr, n) {
	for (let i = 0; i < arr.length; i += n) {
		yield arr.slice(i, i + n)
	}
}

let oldSt
// should call this when host/port/apiKey/importFolders changes
async function updateSyncthing() {
	const settings = await models.Settings.findOne({}, 'syncthing')
	if (!settings?.syncthing) return console.error('no syncthing settings defined')

	const { host, port, apiKey, importFolders } = settings.syncthing

	const st = syncthing({ host, port, apiKey, eventListener: true })
	const { folders } = await st.system.getConfig()

	st.on('itemFinished', async ({ action, error, folder, item, type }, { time }) => {
		if (error !== null) return console.error(error)
		else if (type !== 'file' || action !== 'update' || !importFolders?.includes(folder)) return

		time = new Date(time)
		console.log('if: ', folder, settings.syncthing.folderInfo, { time })

		const filePath = path.join(folders.find(({ id }) => id === folder).path, item)
		const hash = await md5File(filePath)
		const uploadedFile = await models.Photo.findOne(
			{
				hash,
				originalHash: hash,
			},
			['hash', 'originalHash']
		)
		if (uploadedFile) return
		await photoQueue.add({ filePath, hash, time, folder })
	})

	// detect folder path changes and update syncthing
	st.on(
		'configSaved',
		async ({ Folders: newFolders }) =>
			!isEqual(...[folders, newFolders].map(folderList => folderList.map(folder => pick(folder, 'id', 'path')))) && updateSyncthing()
	)

	if (oldSt) ['itemFinished', 'configSaved'].forEach(type => oldSt.removeAllListeners(type))

	oldSt = st
}

async function runScan() {
	const settings = await models.Settings.findOne({})
	if (!settings) return console.error('no settings defined, skipping events')

	// if (lastScan && (!lastScanCompleted || new Date() - lastScanCompleted < 1000 * 60 * 5))
	// 	return console.log('scan stopped, lastScan was less than 5m ago')

	settings.syncthing.lastScan = new Date()
	settings.syncthing.lastScanCompleted = null
	await settings.save()

	async function checkFolder(folderId) {
		const folderPath = folders.find(({ id }) => folderId === id)?.path
		if (!folderPath) return console.error(`folder path not found for folder id: ${folderId}`)
		const files = await getFiles(folder)
		if (!files.length) return console.log(`no files found in folder id: ${folderId}, skipping detection`)
		await detectQueue.addBulk([...chunks(files, 50)].map(files => ({ data: { files } })))
	}

	const { folders } = await st.system.getConfig()
	for (let folderId of settings.syncthing.importFolders) await checkFolder(folderId)
	// const folderStat = await st.stats.folders()
	// for (let { id, lastFile } of settings.syncthing.folderInfo) {
	// 	try {
	// 		const folderPath = folders.find(folder => id === folder.id).path
	// 		const currentLastFilePath = path.join(folderPath, folderStat[id]?.lastFile?.filename)
	// 		const hash = await md5File(currentLastFilePath)
	// 		const relativePath = lastFile?.path && path.relative(currentLastFilePath, lastFile?.path)
	// 		if (relativePath === '' && hash === lastFile.hash) {
	// 			console.log(`folder: ${id} is up to date`)
	// 			continue
	// 		}
	// 		console.log(`folder: ${id} needs an update`, { relativePath, lastFile, hash })

	// 		//const files = await getFiles(folder)
	// 		const fileInfo = await st.db.browse(id)
	// 		const files = getDbFiles(fileInfo, lastFile.time).map(({ name, modTime: time }) => ({
	// 			filePath: path.join(folderPath, name),
	// 			time,
	// 			folder: id,
	// 		}))
	// 		await detectQueue.addBulk([...chunks(files, 50)].map(files => ({ data: { files } })))
	// 	} catch (err) {
	// 		console.error('scan failed: ', err)
	// 	}
	// }
}

async function clearTemp() {
	const files = await fs.readdir(tempdir)
	const hashMap = await Promise.all(files.map(async fileName => ({ fileName, hash: await md5File(path.join(tempdir, fileName)) })))
	const uploadedFiles = await models.Photo.find(
		{
			hash: { $in: hashMap.map(({ hash }) => hash) },
		},
		['hash', '_id']
	)

	console.log(hashMap)

	for (let { fileName, hash: oldHash } of hashMap) {
		const uploadedFile = uploadedFiles.find(({ hash }) => hash === oldHash)
		console.log(fileName, uploadedFile)
		if (!uploadedFile) continue

		const oldPath = path.join(tempdir, fileName)
		const ffOld = await ffprobe(oldPath, { path: './ffprobe.exe' }).catch(err => console.error('ff: ', err))
		//console.log(util.inspect({ ff }, { showHidden: false, depth: null }))
		const video = ffOld.streams.some(({ duration_ts }) => duration_ts > 1)
		const newPath = path.join(backupdir, uploadedFile._id + (video ? '.mp4' : '.webp'))
		console.log(ffOld.streams)
		if (video) {
			const maxBitrate = Math.max(...ffOld.streams.map(({ bit_rate }) => parseFloat(bit_rate)))
			console.log({ maxBitrate })
			if (maxBitrate > 2000000) {
				await new Promise(res => ffmpeg().input(oldPath).videoCodec('libx265').on('error', console.error).on('end', res).save(newPath))
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
		} else {
			await new Promise(res => ffmpeg().input(oldPath).on('error', console.error).on('end', res).save(newPath))
		}
		console.log({ oldPath, newPath })
		const hash = await md5File(newPath)
		const exif = await exifr.parse(newPath).catch(err => console.error('exif: ', err))
		const ffNew = await ffprobe(newPath, { path: './ffprobe.exe' }).catch(err => console.error('ff: ', err))
		const photo = await models.Photo.updateOne(
			{ _id: uploadedFile._id },
			{
				source: newPath,
				width: exif?.ExifImageWidth || ffNew?.streams?.[0]?.width,
				height: exif?.ExifImageHeight || ffNew?.streams?.[0]?.height,
				hash,
			}
		)
		console.log(photo)
	}
}

updateSyncthing()

//detectFiles()
//clearTemp()
