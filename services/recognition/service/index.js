const models = require('../../../models')
const path = require('path')
const fs = require('fs/promises')
const md5File = require('md5-file')
const syncthing = require('node-syncthing')
const { photoQueue, detectQueue } = require('../queues')
const { isEqual, pick, chunk } = require('lodash')
const Redis = require('ioredis')
const sub = new Redis()

let st
let oldSt
// should call this when syncthing config changes
async function updateSyncthing(config) {
	if (!config) {
		const settings = await models.Settings.findOne({}, 'syncthing')
		if (!settings?.syncthing) return console.error('no syncthing settings defined')
		config = settings.syncthing
	}

	const { host, port, apiKey, importFolders } = config

	st = syncthing({ host, port, apiKey, eventListener: true })
	const { folders } = await st.system.getConfig()

	st.on('itemFinished', async ({ action, error, folder, item, type }, { time }) => {
		if (error !== null) return console.error(error)
		else if (type !== 'file' || action !== 'update' || !importFolders?.includes(folder)) return

		time = new Date(time)

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
		async ({ folders: newFolders }) =>
			!isEqual(...[folders, newFolders].map(folderList => folderList.map(folder => pick(folder, 'id', 'path')))) && updateSyncthing()
	)

	if (oldSt) oldSt.removeAllListeners()

	oldSt = st

	console.log('updated syncthing config')
}

sub.subscribe('settings.syncthing', err => err && console.error('redis error subscribing to settings.syncthing: ', err))
sub.on('message', (channel, message) => updateSyncthing(JSON.parse(message)))

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

	const settings = await models.Settings.findOne({}, ['lastScan', 'lastScanCompleted', 'syncthing'])
	if (!settings) return console.error('no settings defined, skipping scan')
	else if (settings.lastScan && (!settings.lastScanCompleted || new Date() - settings.lastScanCompleted < 1000 * 60 * 5))
		return console.log('scan stopped, lastScan was less than 5m ago')

	settings.lastScan = new Date()
	settings.lastScanCompleted = null
	await settings.save()

	let totalNewFiles = 0

	async function checkFolder(folderId) {
		const folderPath = folders.find(({ id }) => folderId === id)?.path
		if (!folderPath) return console.error(`folder path not found for folder id: ${folderId}`)

		const files = await getFiles(folderPath)
		if (!files.length) return console.log(`no files found in folder id: ${folderId}, skipping detection`)

		console.log(`new files in folder id: ${folderId}, count: ${files.length}`)
		await detectQueue.addBulk(chunk(files, 50).map(files => ({ data: { files } })))
		totalNewFiles += files.length
	}

	for (let folderId of settings.syncthing.importFolders) await checkFolder(folderId)

	if (totalNewFiles !== 0) return true

	settings.lastScanCompleted = new Date()
	await settings.save()
}

updateSyncthing().then(runScan)
