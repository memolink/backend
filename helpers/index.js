const ffmpeg = require('fluent-ffmpeg')
const { promisify } = require('util')

const ffprobe = promisify(ffmpeg.ffprobe)

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

module.exports = { rotationActions, ffprobe }
