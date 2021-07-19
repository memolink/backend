const models = require('../../../models')
const path = require('path')
const fs = require('fs/promises')
const md5File = require('md5-file')
const syncthing = require('node-syncthing')
const { photoQueue, detectQueue } = require('../queues')
const { isEqual, pick, chunk } = require('lodash')

let st
let oldSt

// should call this when syncthing config changes
async function updateSyncthing() {
	st = syncthing({ host: process.env.SYNCTHING_HOST, port: process.env.SYNCTHING_PORT, apiKey: process.env.SYNCTHING_API_KEY, eventListener: true })
	const { folders } = await st.system.getConfig()

	st.on('itemFinished', async ({ action, error, folder, item, type }) => {
		if (error !== null) return console.error(error)
		else if (type !== 'file' || action !== 'update') return

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
		await photoQueue.add({ filePath, hash })
	})

	// detect folder path changes and update syncthing
	st.on(
		'configSaved',
		async ({ folders: newFolders }) =>
			!isEqual(...[folders, newFolders].map(folderList => folderList.map(folder => pick(folder, 'id', 'path')))) && updateSyncthing()
	)

	if (oldSt) oldSt.removeAllListeners()

	oldSt = st

	console.log('updated syncthing config')
}

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

// should run on every syncthing restart or disconnect
async function runScan() {
	const { folders } = await st.system.getConfig()

	const settings = await models.Settings.findOne({}, ['lastScan', 'lastScanCompleted'])
	if (!settings) return console.error('no settings defined, skipping scan')
	else if (settings.lastScan && (!settings.lastScanCompleted || new Date() - settings.lastScanCompleted < 1000 * 60 * 5))
		return console.log('scan stopped, lastScan was less than 5m ago')

	settings.lastScan = new Date()
	settings.lastScanCompleted = null
	await settings.save()

	let totalNewFiles = 0

	async function checkFolder(folderPath) {
		const files = await getFiles(folderPath)
		if (!files.length) return console.log(`no files found in folder id: ${folderId}, skipping detection`)

		console.log(`new files in folder: ${folderPath}, count: ${files.length}`)
		await detectQueue.addBulk(chunk(files, 50).map(files => ({ data: { files } })))
		totalNewFiles += files.length
	}

	for (let { path } of folders) await checkFolder(path)

	if (totalNewFiles !== 0) return true

	settings.lastScanCompleted = new Date()
	await settings.save()
}

updateSyncthing().then(runScan)
