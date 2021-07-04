const aggregatePaginate = require('mongoose-aggregate-paginate-v2')

/**
 *
 * @param {import('mongoose')} mongoose
 * @returns {import('mongoose').Model}
 */
module.exports = mongoose => {
	const pointSchema = new mongoose.Schema({
		type: {
			type: String,
			enum: ['Point'],
			required: true,
		},
		coordinates: {
			type: [Number],
			required: true,
		},
	})

	const schema = new mongoose.Schema({
		video: Boolean,
		rotated: Number,
		thumb: String,
		thumbvideo: String,
		source: String,
		originalSource: String,
		width: Number,
		height: Number,
		hash: String,
		originalHash: String,
		location: {
			type: pointSchema,
			index: '2dsphere',
		},
		date: Date,
		tags: [
			{
				mid: String,
				description: String,
				score: Number,
			},
		],
		metadata: Object,
	})
	schema.plugin(aggregatePaginate)

	return mongoose.model('Photo', schema)
}
