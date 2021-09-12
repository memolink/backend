const fs = require('fs/promises')
const MediaInfoFactory = require('mediainfo.js')
const mediaInfoPromise = MediaInfoFactory({ format: 'object' })

const rotationActions = {
	1: { dimensionSwapped: false, scaleX: 1, scaleY: 1, deg: 0, rad: 0 },
	2: { dimensionSwapped: false, scaleX: -1, scaleY: 1, deg: 0, rad: 0 },
	3: { dimensionSwapped: false, scaleX: 1, scaleY: 1, deg: 180, rad: (180 * Math.PI) / 180 },
	4: { dimensionSwapped: false, scaleX: -1, scaleY: 1, deg: 180, rad: (180 * Math.PI) / 180 },
	5: { dimensionSwapped: true, scaleX: 1, scaleY: -1, deg: 90, rad: (90 * Math.PI) / 180 },
	6: { dimensionSwapped: true, scaleX: 1, scaleY: 1, deg: 90, rad: (90 * Math.PI) / 180 },
	7: { dimensionSwapped: true, scaleX: 1, scaleY: -1, deg: 270, rad: (270 * Math.PI) / 180 },
	8: { dimensionSwapped: true, scaleX: 1, scaleY: 1, deg: 270, rad: (270 * Math.PI) / 180 },
}

const getMediaInfo = async file => {
	let fileHandle

	const readChunk = async (size, offset) => {
		const buffer = new Uint8Array(size)
		await fileHandle.read(buffer, 0, size, offset)
		return buffer
	}

	try {
		fileHandle = await fs.open(file, 'r')
		const fileSize = (await fileHandle.stat()).size

		const {
			media: { track: tracks },
		} = await (await mediaInfoPromise).analyzeData(() => fileSize, readChunk)

		const general = tracks.shift()

		return { general, tracks }
	} catch (err) {
		throw err
	} finally {
		fileHandle && (await fileHandle.close())
	}
}

module.exports = { rotationActions, getMediaInfo }
